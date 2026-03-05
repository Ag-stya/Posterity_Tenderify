import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SearchService } from './search.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('tenders')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get('search')
  @UseGuards(JwtAuthGuard)
  async searchTenders(
    @Query('q') q?: string,
    @Query('sourceSiteIds') sourceSiteIds?: string,
    @Query('publishedFrom') publishedFrom?: string,
    @Query('publishedTo') publishedTo?: string,
    @Query('closingSoonDays') closingSoonDays?: string,
    @Query('location') location?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.search.search({
      q,
      sourceSiteIds,
      publishedFrom,
      publishedTo,
      closingSoonDays: closingSoonDays ? parseInt(closingSoonDays, 10) : undefined,
      location,
      page: parseInt(page || '1', 10),
      pageSize: Math.min(parseInt(pageSize || '20', 10), 50),
    });
  }
}
