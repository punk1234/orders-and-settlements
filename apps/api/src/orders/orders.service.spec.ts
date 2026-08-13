import { Types } from 'mongoose';
import { OrdersService } from './orders.service';

function buildModelMock() {
  return {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };
}

function buildAuditServiceMock() {
  return {
    logIfChanged: jest.fn().mockResolvedValue(undefined),
    syncObservedStatus: jest.fn().mockResolvedValue(undefined),
    listForOrder: jest.fn(),
  };
}

describe('OrdersService', () => {
  let modelMock: ReturnType<typeof buildModelMock>;
  let auditServiceMock: ReturnType<typeof buildAuditServiceMock>;
  let service: OrdersService;
  const userId = new Types.ObjectId().toHexString();

  beforeEach(() => {
    modelMock = buildModelMock();
    auditServiceMock = buildAuditServiceMock();
    service = new OrdersService(modelMock as never, auditServiceMock as never);
  });

  describe('create', () => {
    it('computes subtotal/total server-side from line items', async () => {
      modelMock.create.mockResolvedValue({
        _id: new Types.ObjectId(),
        id: 'order-1',
        total: 1000,
        amountPaid: 0,
        dueDate: new Date('2099-01-01'),
      });

      await service.create(userId, {
        customer: 'Acme',
        dueDate: new Date('2026-08-18'),
        lineItems: [{ description: 'Widget', quantity: 2, unitPrice: 500 }],
      });

      expect(modelMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ subtotal: 1000, total: 1000, amountPaid: 0 }),
      );
    });

    it('logs the initial status (fromStatus: null) once the order is created', async () => {
      const orderObjectId = new Types.ObjectId();
      modelMock.create.mockResolvedValue({
        _id: orderObjectId,
        id: orderObjectId.toHexString(),
        total: 1000,
        amountPaid: 0,
        dueDate: new Date('2099-01-01'),
      });

      await service.create(userId, {
        customer: 'Acme',
        dueDate: new Date('2026-08-18'),
        lineItems: [{ description: 'Widget', quantity: 2, unitPrice: 500 }],
      });

      expect(auditServiceMock.logIfChanged).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          orderId: orderObjectId,
          fromStatus: null,
          toStatus: 'pending',
          trigger: 'created',
        }),
      );
    });
  });

  describe('findAllForUser', () => {
    function order(overrides: Partial<Record<string, unknown>>) {
      return {
        total: 1000,
        amountPaid: 0,
        dueDate: new Date('2026-08-18T00:00:00Z'),
        ...overrides,
      };
    }

    beforeEach(() => {
      modelMock.find.mockReturnValue({
        sort: () => ({
          exec: () =>
            Promise.resolve([
              order({ amountPaid: 0 }), // pending
              order({ amountPaid: 400 }), // partially_paid
              order({ amountPaid: 1000 }), // paid
            ]),
        }),
      });
    });

    it('returns all orders when no status filter is given', async () => {
      const result = await service.findAllForUser(userId);
      expect(result).toHaveLength(3);
    });

    it('filters down to only the requested status', async () => {
      const result = await service.findAllForUser(userId, 'paid');
      expect(result).toHaveLength(1);
    });
  });

  describe('findOneForUserOrThrow', () => {
    it('throws NOT_FOUND for a malformed id without querying the database', async () => {
      await expect(service.findOneForUserOrThrow(userId, 'not-an-id')).rejects.toThrow(
        'Order not found.',
      );
      expect(modelMock.findOne).not.toHaveBeenCalled();
    });

    it('throws NOT_FOUND when no matching order is owned by this user', async () => {
      modelMock.findOne.mockReturnValue({ exec: () => Promise.resolve(null) });
      const validId = new Types.ObjectId().toHexString();

      await expect(service.findOneForUserOrThrow(userId, validId)).rejects.toThrow(
        'Order not found.',
      );
    });

    it('does NOT sync the observed status (that only happens via findOneForUserWithStatusSync)', async () => {
      const validId = new Types.ObjectId();
      modelMock.findOne.mockReturnValue({
        exec: () => Promise.resolve({ _id: validId, total: 1000, amountPaid: 1000 }),
      });

      await service.findOneForUserOrThrow(userId, validId.toHexString());

      expect(auditServiceMock.syncObservedStatus).not.toHaveBeenCalled();
    });
  });

  describe('findOneForUserWithStatusSync', () => {
    it('syncs the observed status when an order is found', async () => {
      const validId = new Types.ObjectId();
      modelMock.findOne.mockReturnValue({
        exec: () =>
          Promise.resolve({
            _id: validId,
            total: 1000,
            amountPaid: 1000,
            dueDate: new Date('2020-01-01'), // long past, but paid takes precedence
          }),
      });

      await service.findOneForUserWithStatusSync(userId, validId.toHexString());

      expect(auditServiceMock.syncObservedStatus).toHaveBeenCalledWith(userId, validId, 'paid');
    });
  });

  describe('update', () => {
    it('rejects edits once a payment has been recorded', async () => {
      const validId = new Types.ObjectId().toHexString();
      modelMock.findOne.mockReturnValue({
        exec: () => Promise.resolve({ amountPaid: 400, save: jest.fn() }),
      });

      await expect(
        service.update(userId, validId, { customer: 'New name' }),
      ).rejects.toThrow('This order has payments recorded and can no longer be edited.');
    });

    it('recomputes totals when line items change', async () => {
      const validId = new Types.ObjectId().toHexString();
      const save = jest.fn().mockResolvedValue(undefined);
      const existing = {
        amountPaid: 0,
        customer: 'Old',
        dueDate: new Date('2026-08-18'),
        lineItems: [{ description: 'Widget', quantity: 2, unitPrice: 500 }],
        subtotal: 1000,
        total: 1000,
        save,
      };
      modelMock.findOne.mockReturnValue({ exec: () => Promise.resolve(existing) });

      const result = await service.update(userId, validId, {
        lineItems: [{ description: 'Widget', quantity: 3, unitPrice: 500 }],
      });

      expect(result.subtotal).toBe(1500);
      expect(result.total).toBe(1500);
      expect(save).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('rejects deletion once a payment has been recorded', async () => {
      const validId = new Types.ObjectId().toHexString();
      modelMock.findOne.mockReturnValue({
        exec: () => Promise.resolve({ amountPaid: 400, deleteOne: jest.fn() }),
      });

      await expect(service.remove(userId, validId)).rejects.toThrow(
        'This order has payments recorded and cannot be deleted.',
      );
    });

    it('deletes the order when there are no payments', async () => {
      const validId = new Types.ObjectId().toHexString();
      const deleteOne = jest.fn().mockResolvedValue(undefined);
      modelMock.findOne.mockReturnValue({
        exec: () => Promise.resolve({ amountPaid: 0, deleteOne }),
      });

      await service.remove(userId, validId);
      expect(deleteOne).toHaveBeenCalled();
    });
  });

  describe('exportToCsvRows', () => {
    it('queries only by userId when no date range is given', async () => {
      modelMock.find.mockReturnValue({ sort: () => ({ exec: () => Promise.resolve([]) }) });

      await service.exportToCsvRows(userId, {});

      expect(modelMock.find).toHaveBeenCalledWith({ userId: expect.any(Types.ObjectId) });
    });

    it('adds an inclusive dueDate range filter when from/to are given', async () => {
      modelMock.find.mockReturnValue({ sort: () => ({ exec: () => Promise.resolve([]) }) });
      const from = new Date('2026-08-01');
      const to = new Date('2026-08-31');

      await service.exportToCsvRows(userId, { from, to });

      expect(modelMock.find).toHaveBeenCalledWith(
        expect.objectContaining({
          dueDate: expect.objectContaining({
            $gte: from,
            $lte: new Date('2026-08-31T23:59:59.999Z'),
          }),
        }),
      );
    });
  });
});
