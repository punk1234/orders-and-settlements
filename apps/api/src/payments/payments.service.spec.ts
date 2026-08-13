import { Types } from 'mongoose';
import { PaymentsService } from './payments.service';

function buildSessionMock() {
  return {
    withTransaction: jest.fn(async (fn: () => Promise<void>) => {
      await fn();
    }),
    endSession: jest.fn().mockResolvedValue(undefined),
  };
}

function buildAuditServiceMock() {
  return {
    logIfChanged: jest.fn().mockResolvedValue(undefined),
    syncObservedStatus: jest.fn().mockResolvedValue(undefined),
    listForOrder: jest.fn(),
  };
}

const FUTURE_DUE_DATE = new Date('2099-01-01');

describe('PaymentsService', () => {
  const userId = new Types.ObjectId().toHexString();
  const orderId = new Types.ObjectId().toHexString();

  let connectionMock: { startSession: jest.Mock };
  let orderModelMock: { findOneAndUpdate: jest.Mock; findOne: jest.Mock };
  let paymentModelMock: { create: jest.Mock; find: jest.Mock };
  let auditServiceMock: ReturnType<typeof buildAuditServiceMock>;
  let service: PaymentsService;
  let session: ReturnType<typeof buildSessionMock>;

  beforeEach(() => {
    session = buildSessionMock();
    connectionMock = { startSession: jest.fn().mockResolvedValue(session) };
    orderModelMock = { findOneAndUpdate: jest.fn(), findOne: jest.fn() };
    paymentModelMock = { create: jest.fn(), find: jest.fn() };
    auditServiceMock = buildAuditServiceMock();

    service = new PaymentsService(
      connectionMock as never,
      orderModelMock as never,
      paymentModelMock as never,
      auditServiceMock as never,
    );
  });

  describe('recordPayment', () => {
    it('rejects a malformed order id without touching the database', async () => {
      await expect(
        service.recordPayment(userId, 'not-an-id', { amount: 100, date: new Date() }),
      ).rejects.toThrow('Order not found.');
      expect(connectionMock.startSession).not.toHaveBeenCalled();
    });

    it('records the payment when the atomic guard allows it', async () => {
      orderModelMock.findOneAndUpdate.mockReturnValue({
        exec: () =>
          Promise.resolve({
            id: orderId,
            amountPaid: 1000,
            total: 1000,
            dueDate: FUTURE_DUE_DATE,
          }),
      });
      paymentModelMock.create.mockResolvedValue([{ id: 'payment-1', amount: 400 }]);

      const result = await service.recordPayment(userId, orderId, {
        amount: 400,
        date: new Date('2026-08-12'),
        note: 'first installment',
      });

      expect(result).toEqual({ id: 'payment-1', amount: 400 });
      expect(orderModelMock.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          $expr: { $lte: [{ $add: ['$amountPaid', 400] }, { $add: ['$total', 0.005] }] },
        }),
        { $inc: { amountPaid: 400 } },
        expect.objectContaining({ new: true }),
      );
      expect(paymentModelMock.create).toHaveBeenCalledWith(
        [expect.objectContaining({ amount: 400, note: 'first installment' })],
        expect.objectContaining({ session }),
      );
    });

    it('logs a status transition when the payment changes status (pending -> paid)', async () => {
      // amountPaid lands at 1000 (== total) after a 1000 payment, so the
      // "before" state (computed as amountPaid - amount = 0) was pending.
      orderModelMock.findOneAndUpdate.mockReturnValue({
        exec: () =>
          Promise.resolve({
            id: orderId,
            amountPaid: 1000,
            total: 1000,
            dueDate: FUTURE_DUE_DATE,
          }),
      });
      paymentModelMock.create.mockResolvedValue([{ id: 'payment-1', amount: 1000 }]);

      await service.recordPayment(userId, orderId, { amount: 1000, date: new Date() });

      expect(auditServiceMock.logIfChanged).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          fromStatus: 'pending',
          toStatus: 'paid',
          trigger: 'payment',
        }),
      );
    });

    it('rejects with OVERPAYMENT_REJECTED and the correct max amount when the guard fails', async () => {
      orderModelMock.findOneAndUpdate.mockReturnValue({ exec: () => Promise.resolve(null) });
      orderModelMock.findOne.mockReturnValue({
        session: () => ({
          exec: () => Promise.resolve({ total: 1000, amountPaid: 600 }),
        }),
      });

      await expect(
        service.recordPayment(userId, orderId, { amount: 500, date: new Date() }),
      ).rejects.toThrow('Payment exceeds the amount due. Maximum allowed payment is 400.');
      expect(paymentModelMock.create).not.toHaveBeenCalled();
      expect(auditServiceMock.logIfChanged).not.toHaveBeenCalled();
    });

    it('rejects with NOT_FOUND when the order does not exist or is not owned by this user', async () => {
      orderModelMock.findOneAndUpdate.mockReturnValue({ exec: () => Promise.resolve(null) });
      orderModelMock.findOne.mockReturnValue({
        session: () => ({ exec: () => Promise.resolve(null) }),
      });

      await expect(
        service.recordPayment(userId, orderId, { amount: 100, date: new Date() }),
      ).rejects.toThrow('Order not found.');
    });

    it('exercises the exact sample scenario from the assignment', async () => {
      // $1,000 order, $400 then $600 should both succeed; a final $1 should be rejected.
      let amountPaid = 0;
      const total = 1000;

      orderModelMock.findOneAndUpdate.mockImplementation((filter) => ({
        exec: async () => {
          const amount = filter.$expr.$lte[0].$add[1];
          if (amountPaid + amount <= total + 0.005) {
            amountPaid += amount;
            return { id: orderId, amountPaid, total, dueDate: FUTURE_DUE_DATE };
          }
          return null;
        },
      }));
      orderModelMock.findOne.mockReturnValue({
        session: () => ({ exec: () => Promise.resolve({ total, amountPaid }) }),
      });
      paymentModelMock.create.mockImplementation((docs) =>
        Promise.resolve([{ id: `payment-${docs[0].amount}`, ...docs[0] }]),
      );

      await service.recordPayment(userId, orderId, { amount: 400, date: new Date() });
      expect(amountPaid).toBe(400);

      await service.recordPayment(userId, orderId, { amount: 600, date: new Date() });
      expect(amountPaid).toBe(1000);

      await expect(
        service.recordPayment(userId, orderId, { amount: 1, date: new Date() }),
      ).rejects.toThrow('Payment exceeds the amount due. Maximum allowed payment is 0.');
    });

    it('under two genuinely concurrent payments that would jointly overpay, exactly one succeeds', async () => {
      // $1,000 order. Two $700 payments fired via Promise.all — together
      // they'd overpay by $400, so only one may win.
      //
      // The mock models MongoDB's real guarantee: the network round-trip has
      // random jitter (so either call can arrive "first"), but once a call's
      // findOneAndUpdate begins its check-and-increment, that happens as one
      // uninterrupted synchronous step, exactly like a real single-document
      // atomic update on the server. That's what this test is actually
      // allowed to claim proves — the real atomicity guarantee still comes
      // from MongoDB itself, not from anything a mock can demonstrate.
      let amountPaid = 0;
      const total = 1000;

      orderModelMock.findOneAndUpdate.mockImplementation((filter) => ({
        exec: async () => {
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 5));
          const amount = filter.$expr.$lte[0].$add[1];
          if (amountPaid + amount <= total + 0.005) {
            amountPaid += amount;
            return { id: orderId, amountPaid, total, dueDate: FUTURE_DUE_DATE };
          }
          return null;
        },
      }));
      orderModelMock.findOne.mockReturnValue({
        session: () => ({ exec: async () => ({ total, amountPaid }) }),
      });
      paymentModelMock.create.mockImplementation((docs) =>
        Promise.resolve([{ id: `payment-${docs[0].amount}`, ...docs[0] }]),
      );

      const results = await Promise.allSettled([
        service.recordPayment(userId, orderId, { amount: 700, date: new Date() }),
        service.recordPayment(userId, orderId, { amount: 700, date: new Date() }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
        message: expect.stringContaining('Payment exceeds the amount due'),
      });
      // The winner's payment landed exactly once — total never exceeded $1,000.
      expect(amountPaid).toBe(700);
      expect(paymentModelMock.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('listForOrder', () => {
    it('throws NOT_FOUND when the order is not owned by this user', async () => {
      orderModelMock.findOne.mockReturnValue({ exec: () => Promise.resolve(null) });

      await expect(service.listForOrder(userId, orderId)).rejects.toThrow('Order not found.');
    });

    it('returns the payment history sorted by date when ownership checks out', async () => {
      orderModelMock.findOne.mockReturnValue({ exec: () => Promise.resolve({ id: orderId }) });
      paymentModelMock.find.mockReturnValue({
        sort: () => ({ exec: () => Promise.resolve([{ id: 'p1' }, { id: 'p2' }]) }),
      });

      const result = await service.listForOrder(userId, orderId);
      expect(result).toHaveLength(2);
    });
  });
});
