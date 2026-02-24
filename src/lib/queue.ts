import { Queue, QueueOptions } from 'bullmq';
import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? '';

// Lazy connection — only created when Redis URL is available
let _connection: IORedis | null = null;
let _queue: Queue | null = null;

function getConnection(): IORedis {
  if (!_connection) {
    if (!REDIS_URL) throw new Error('REDIS_URL env var not set');
    _connection = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null, // required by BullMQ
      enableReadyCheck: false,
    });
  }
  return _connection;
}

export const QUEUE_NAME = 'perizia-analysis';

export type AnalysisJobData = {
  jobId:      string; // DB job id (uuid)
  documentId: string; // DB document id
  s3Key:      string; // S3 object key of the PDF
  filename:   string; // original filename (for logging)
};

export function getQueue(): Queue<AnalysisJobData> {
  if (!_queue) {
    const opts: QueueOptions = {
      connection: getConnection(),
      defaultJobOptions: {
        attempts:    3,
        backoff:     { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail:     500,
      },
    };
    _queue = new Queue<AnalysisJobData>(QUEUE_NAME, opts);
  }
  return _queue as Queue<AnalysisJobData>;
}

/**
 * Enqueue a PDF analysis job. Returns the BullMQ job id.
 * Gracefully returns null if Redis is not configured.
 */
export async function enqueueAnalysis(data: AnalysisJobData): Promise<string | null> {
  if (!REDIS_URL) {
    console.warn('[queue] REDIS_URL not set — job not enqueued');
    return null;
  }
  try {
    const queue = getQueue();
    const job = await queue.add('analyze', data, { jobId: data.jobId });
    return job.id ?? null;
  } catch (e) {
    console.error('[queue] enqueue error', e);
    return null;
  }
}
