import { Types } from 'mongoose';
import { AuditService } from './audit.service';

function buildModelMock() {
  return {
    create: jest.fn().mockResolvedValue([{ id: 'entry-1' }]),
    find: jest.fn(),
    findOne: jest.fn(),
  };
}

describe('AuditService', () => {
  const userId = new Types.ObjectId().toHexString();
  const orderId = new Types.ObjectId();

  let modelMock: ReturnType<typeof buildModelMock>;
  let service: AuditService;

  beforeEach(() => {
    modelMock = buildModelMock();
    service = new AuditService(modelMock as never);
  });

  describe('logIfChanged', () => {
    it('does nothing when fromStatus and toStatus are the same', async () => {
      await service.logIfChanged({
        userId,
        orderId,
        fromStatus: 'pending',
        toStatus: 'pending',
        trigger: 'observed',
      });

      expect(modelMock.create).not.toHaveBeenCalled();
    });

    it('writes an entry when the status actually changed', async () => {
      await service.logIfChanged({
        userId,
        orderId,
        fromStatus: 'pending',
        toStatus: 'partially_paid',
        trigger: 'payment',
      });

      expect(modelMock.create).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            orderId,
            fromStatus: 'pending',
            toStatus: 'partially_paid',
            trigger: 'payment',
          }),
        ],
        expect.anything(),
      );
    });

    it('logs the very first entry with fromStatus: null', async () => {
      await service.logIfChanged({
        userId,
        orderId,
        fromStatus: null,
        toStatus: 'pending',
        trigger: 'created',
      });

      expect(modelMock.create).toHaveBeenCalledWith(
        [expect.objectContaining({ fromStatus: null, toStatus: 'pending', trigger: 'created' })],
        expect.anything(),
      );
    });
  });

  describe('syncObservedStatus', () => {
    it('does nothing when the current status matches the last logged entry', async () => {
      modelMock.findOne.mockReturnValue({
        sort: () => ({ exec: () => Promise.resolve({ toStatus: 'overdue' }) }),
      });

      await service.syncObservedStatus(userId, orderId, 'overdue');

      expect(modelMock.create).not.toHaveBeenCalled();
    });

    it('logs a new observed transition when the status has drifted (e.g. silently went overdue)', async () => {
      modelMock.findOne.mockReturnValue({
        sort: () => ({ exec: () => Promise.resolve({ toStatus: 'pending' }) }),
      });

      await service.syncObservedStatus(userId, orderId, 'overdue');

      expect(modelMock.create).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            fromStatus: 'pending',
            toStatus: 'overdue',
            trigger: 'observed',
          }),
        ],
        expect.anything(),
      );
    });

    it('backfills with trigger "created" (not "observed") when there is no prior history at all', async () => {
      modelMock.findOne.mockReturnValue({
        sort: () => ({ exec: () => Promise.resolve(null) }),
      });

      await service.syncObservedStatus(userId, orderId, 'pending');

      expect(modelMock.create).toHaveBeenCalledWith(
        [expect.objectContaining({ fromStatus: null, toStatus: 'pending', trigger: 'created' })],
        expect.anything(),
      );
    });
  });

  describe('listForOrder', () => {
    it('returns entries sorted chronologically', async () => {
      modelMock.find.mockReturnValue({
        sort: () => ({ exec: () => Promise.resolve([{ id: 'a' }, { id: 'b' }]) }),
      });

      const result = await service.listForOrder(orderId);
      expect(result).toHaveLength(2);
    });
  });
});
