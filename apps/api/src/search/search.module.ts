import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { EmbeddingService } from './embedding.service';

@Module({
  controllers: [SearchController],
  providers: [SearchService, EmbeddingService],
  exports: [EmbeddingService],
})
export class SearchModule {}
