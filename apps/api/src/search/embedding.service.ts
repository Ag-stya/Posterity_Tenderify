import { Injectable, OnModuleInit, Logger } from '@nestjs/common';

@Injectable()
export class EmbeddingService implements OnModuleInit {
  private pipeline: any = null;
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly modelName = process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2';
  private initPromise: Promise<void> | null = null;

  async onModuleInit() {
    // Start loading but don't block startup
    this.initPromise = this.loadModel();
  }

  private async loadModel() {
    try {
      this.logger.log(`Loading embedding model: ${this.modelName}...`);
      const { pipeline } = await import('@xenova/transformers');
      this.pipeline = await pipeline('feature-extraction', this.modelName);
      this.logger.log('Embedding model loaded successfully');
    } catch (err) {
      this.logger.error('Failed to load embedding model', err);
    }
  }

  async embed(text: string): Promise<number[] | null> {
    if (this.initPromise) {
      await this.initPromise;
      this.initPromise = null;
    }
    if (!this.pipeline) return null;

    try {
      const output = await this.pipeline(text, {
        pooling: 'mean',
        normalize: true,
      });
      return Array.from(output.data as Float32Array);
    } catch (err) {
      this.logger.error('Embedding generation failed', err);
      return null;
    }
  }

  isReady(): boolean {
    return this.pipeline !== null;
  }
}
