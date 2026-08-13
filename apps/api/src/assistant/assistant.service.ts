import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { AppException } from '../common/exceptions/app.exception';
import { withRetry } from '../common/utils/retry';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import { OrderResponse } from '../orders/order.mapper';
import { ASSISTANT_TOOLS, executeAssistantTool } from './assistant.tools';

const MAX_TOOL_ITERATIONS = 4;

const SYSTEM_PROMPT = `You are a financial assistant embedded in an orders & settlements dashboard.
You can only see the current user's own orders and payments, via the tools provided — you have no
other source of information. Always use the tools to look up real data before answering; never guess
or invent numbers. Keep answers concise and factual (a sentence or two, plus specific figures when
relevant). If a question can't be answered from orders/payments data, say so plainly.`;

export interface AssistantQueryResult {
  answer: string;
  orders: OrderResponse[];
}

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);
  private readonly client?: Anthropic;
  private readonly model: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly ordersService: OrdersService,
    private readonly paymentsService: PaymentsService,
  ) {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    this.model = this.configService.get<string>('ANTHROPIC_MODEL') ?? 'claude-haiku-4-5-20251001';
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    }
  }

  async query(userId: string, question: string): Promise<AssistantQueryResult> {
    if (!this.client) {
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'ASSISTANT_UNAVAILABLE',
        'The assistant is not configured on this deployment (missing ANTHROPIC_API_KEY).',
      );
    }

    const client = this.client;
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: question }];
    let matchedOrders: OrderResponse[] = [];

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      let response: Anthropic.Message;
      try {
        // Retries transient failures (network errors, 429, 5xx) with backoff;
        // does not retry on 4xx (bad key, malformed request) since those
        // would just fail again the same way.
        response = await withRetry(() =>
          client.messages.create({
            model: this.model,
            max_tokens: 1024,
            system: SYSTEM_PROMPT,
            tools: ASSISTANT_TOOLS,
            messages,
          }),
        );
      } catch (err) {
        this.logger.warn(
          `Anthropic API call failed after retries: ${err instanceof Error ? err.message : err}`,
        );
        throw new AppException(
          HttpStatus.SERVICE_UNAVAILABLE,
          'ASSISTANT_UNAVAILABLE',
          'The assistant is temporarily unavailable. Please try again shortly.',
        );
      }

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
      );

      if (toolUseBlocks.length === 0) {
        const answer = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('\n')
          .trim();
        return { answer: answer || "I couldn't find an answer to that.", orders: matchedOrders };
      }

      messages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        try {
          const result = await executeAssistantTool(
            this.ordersService,
            this.paymentsService,
            userId,
            block.name,
            (block.input ?? {}) as Record<string, unknown>,
          );
          if (result.matchedOrders) matchedOrders = result.matchedOrders;
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result.output),
          });
        } catch (err) {
          this.logger.warn(`Tool ${block.name} failed: ${err instanceof Error ? err.message : err}`);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify({ error: 'Tool execution failed.' }),
            is_error: true,
          });
        }
      }
      messages.push({ role: 'user', content: toolResults });
    }

    throw new AppException(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'ASSISTANT_ERROR',
      'The assistant could not produce an answer. Please try rephrasing your question.',
    );
  }
}
