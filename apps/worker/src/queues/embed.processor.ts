import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma.service';

@Processor('embed', { concurrency: 1 })
export class EmbedProcessor extends WorkerHost {
  private readonly logger = new Logger(EmbedProcessor.name);
  private pipeline: any = null;
  private modelLoading: Promise<void> | null = null;

  constructor(private readonly prisma: PrismaService) {
    super();
    this.modelLoading = this.loadModel();
  }

  private async loadModel() {
    try {
      const modelName = process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2';
      this.logger.log(`Loading embedding model: ${modelName}...`);
      const { pipeline } = await import('@xenova/transformers');
      this.pipeline = await pipeline('feature-extraction', modelName);
      this.logger.log('Embedding model loaded in worker');
    } catch (err) {
      this.logger.error('Failed to load embedding model in worker', err);
    }
  }

  async process(job: Job<{ tenderId: string }>): Promise<void> {
    if (this.modelLoading) {
      await this.modelLoading;
      this.modelLoading = null;
    }

    if (!this.pipeline) {
      this.logger.warn('Embedding model not available, skipping');
      return;
    }

    const { tenderId } = job.data;

    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
    });

    if (!tender) {
      this.logger.warn(`Tender ${tenderId} not found`);
      return;
    }

    try {
      const output = await this.pipeline(tender.searchText, {
        pooling: 'mean',
        normalize: true,
      });

      const embedding = Array.from(output.data as Float32Array);
      const vectorStr = `[${embedding.join(',')}]`;

      await this.prisma.$executeRawUnsafe(
        `UPDATE tenders SET embedding = $1::vector WHERE id = $2::uuid`,
        vectorStr,
        tenderId,
      );

      this.logger.debug(`Embedded tender ${tenderId}`);
    } catch (err: any) {
      this.logger.error(`Failed to embed tender ${tenderId}: ${err.message}`);
    }
  }
}
