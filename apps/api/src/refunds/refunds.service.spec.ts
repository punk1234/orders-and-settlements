import { Types } from 'mongoose';
import { RefundsService } from './refunds.service';

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

describe('RefundsService', () => {
  const userId = new Types.ObjectId().toHexString();
  const orderId = new Types.ObjectId().toHexString();

  let connectionMock: { startSession: jest.Mock };
  let orderModelMock: { findOneAndUpdate: jest.Mock; findOne: jest.Mock };
  let refundModelMock: { create: jest.Mock; find: jest.Mock };
  let auditServiceMock: ReturnType<typeof buildAuditServiceMock>;
  let service: RefundsService;
  let session: ReturnType<typeof buildSessionMock>;

  beforeEach(() => {
    session = buildSessionMock();
    connectionMock = { startSession: jest.fn().mockResolvedValue(session) };
    orderModelMock = { findOneAndUpdate: jest.fn(), findOne: jest.fn() };
    refundModelMock = { create: jest.fn(), find: jest.fn() };
    auditServiceMock = buildAuditServiceMock();

    service = new RefundsService(
      connectionMock as never,
      orderModelMock as never,
      refundModelMock as never,
      auditServiceMock as never,
    );
  });

  describe('recordRefund', () => {
    it('rejects a malformed order id without touching the database', async () => {
      await expect(
        service.recordRefund(userId, 'not-an-id', { amount: 100, date: new Date() }),
      ).rejects.toThrow('Order not found.');
      expect(connectionMock.startSession).not.toHaveBeenCalled();
    });

    it('records the refund and decrements amountPaid when the guard allows it', async () => {
      orderModelMock.findOneAndUpdate.mockReturnValue({
        exec: () =>
          Promise.resolve({
            id: orderId,
            amountPaid: 600,
            total: 1000,
            dueDate: FUTURE_DUE_DATE,
          }),
      });
      refundModelMock.create.mockResolvedValue([{ id: 'refund-1', amount: 400 }]);

      const result = await service.recordRefund(userId, orderId, {
        amount: 400,
        date: new Date('2026-08-12'),
        note: 'damaged item',
      });

      expect(result).toEqual({ id: 'refund-1', amount: 400 });
      expect(orderModelMock.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          $expr: { $gte: [{ $subtract: ['$amountPaid', 400] }, -0.005] },
        }),
        { $inc: { amountPaid: -400 } },
        expect.objectContaining({ new: true }),
      );
      expect(refundModelMock.create).toHaveBeenCalledWith(
        [expect.objectContaining({ amount: 400, note: 'damaged item' })],
        expect.objectContaining({ session }),
      );
    });

    it('logs a status transition when the refund changes status (paid -> pending)', async () => {
      // amountPaid lands at 0 after refunding the full 1000 that had been
      // paid, so the "before" state (amountPaid + amount = 1000) was paid.
      orderModelMock.findOneAndUpdate.mockReturnValue({
        exec: () =>
          Promise.resolve({ id: orderId, amountPaid: 0, total: 1000, dueDate: FUTURE_DUE_DATE }),
      });
      refundModelMock.create.mockResolvedValue([{ id: 'refund-1', amount: 1000 }]);

      await service.recordRefund(userId, orderId, { amount: 1000, date: new Date() });

      expect(auditServiceMock.logIfChanged).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          fromStatus: 'paid',
          toStatus: 'pending',
          trigger: 'refund',
        }),
      );
    });

    it('rejects with REFUND_EXCEEDS_PAID and the correct max amount when the guard fails', async () => {
      orderModelMock.findOneAndUpdate.mockReturnValue({ exec: () => Promise.resolve(null) });
      orderModelMock.findOne.mockReturnValue({
        session: () => ({ exec: () => Promise.resolve({ total: 1000, amountPaid: 300 }) }),
      });

      await expect(
        service.recordRefund(userId, orderId, { amount: 500, date: new Date() }),
      ).rejects.toThrow('Refund exceeds the amount paid. Maximum allowed refund is 300.');
      expect(refundModelMock.create).not.toHaveBeenCalled();
      expect(auditServiceMock.logIfChanged).not.toHaveBeenCalled();
    });

    it('rejects with NO_PAYMENTS_TO_REFUND when nothing has been paid yet', async () => {
      orderModelMock.findOneAndUpdate.mockReturnValue({ exec: () => Promise.resolve(null) });
      orderModelMock.findOne.mockReturnValue({
        session: () => ({ exec: () => Promise.resolve({ total: 1000, amountPaid: 0 }) }),
      });

      await expect(
        service.recordRefund(userId, orderId, { amount: 50, date: new Date() }),
      ).rejects.toThrow('This order has no payments to refund.');
    });

    it('rejects with NOT_FOUND when the order does not exist or is not owned by this user', async () => {
      orderModelMock.findOneAndUpdate.mockReturnValue({ exec: () => Promise.resolve(null) });
      orderModelMock.findOne.mockReturnValue({
        session: () => ({ exec: () => Promise.resolve(null) }),
      });

      await expect(
        service.recordRefund(userId, orderId, { amount: 100, date: new Date() }),
      ).rejects.toThrow('Order not found.');
    });

    it('under two genuinely concurrent refunds that would jointly over-refund, exactly one succeeds', async () => {
      // $1,000 paid in full. Two $700 refunds fired via Promise.all —
      // together they'd refund $400 more than was ever paid.
      let amountPaid = 1000;
      const total = 1000;

      orderModelMock.findOneAndUpdate.mockImplementation((filter) => ({
        exec: async () => {
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 5));
          const amount = filter.$expr.$gte[0].$subtract[1];
          if (amountPaid - amount >= -0.005) {
            amountPaid -= amount;
            return { id: orderId, amountPaid, total, dueDate: FUTURE_DUE_DATE };
          }
          return null;
        },
      }));
      orderModelMock.findOne.mockReturnValue({
        session: () => ({ exec: async () => ({ total, amountPaid }) }),
      });
      refundModelMock.create.mockImplementation((docs) =>
        Promise.resolve([{ id: `refund-${docs[0].amount}`, ...docs[0] }]),
      );

      const results = await Promise.allSettled([
        service.recordRefund(userId, orderId, { amount: 700, date: new Date() }),
        service.recordRefund(userId, orderId, { amount: 700, date: new Date() }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(amountPaid).toBe(300);
      expect(refundModelMock.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('listForOrder', () => {
    it('throws NOT_FOUND when the order is not owned by this user', async () => {
      orderModelMock.findOne.mockReturnValue({ exec: () => Promise.resolve(null) });

      await expect(service.listForOrder(userId, orderId)).rejects.toThrow('Order not found.');
    });

    it('returns the refund history sorted by date when ownership checks out', async () => {
      orderModelMock.findOne.mockReturnValue({ exec: () => Promise.resolve({ id: orderId }) });
      refundModelMock.find.mockReturnValue({
        sort: () => ({ exec: () => Promise.resolve([{ id: 'r1' }]) }),
      });

      const result = await service.listForOrder(userId, orderId);
      expect(result).toHaveLength(1);
    });
  });
});
