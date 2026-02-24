/**
 * Simple in-memory job queue for PDF processing.
 * For MVP only — replace with Redis/Bull for production.
 */

type JobStatus = 'pending' | 'processing' | 'completed' | 'error';

interface Job {
  id: string;
  status: JobStatus;
  progress: number; // 0-100
  error?: string;
}

class JobQueue {
  private jobs = new Map<string, Job>();

  create(id: string): Job {
    const job: Job = { id, status: 'pending', progress: 0 };
    this.jobs.set(id, job);
    return job;
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  updateProgress(id: string, progress: number): void {
    const job = this.jobs.get(id);
    if (job) {
      job.progress = progress;
      job.status = 'processing';
    }
  }

  complete(id: string): void {
    const job = this.jobs.get(id);
    if (job) {
      job.status = 'completed';
      job.progress = 100;
    }
  }

  fail(id: string, error: string): void {
    const job = this.jobs.get(id);
    if (job) {
      job.status = 'error';
      job.error = error;
    }
  }

  remove(id: string): void {
    this.jobs.delete(id);
  }
}

// Singleton
export const jobQueue = new JobQueue();
