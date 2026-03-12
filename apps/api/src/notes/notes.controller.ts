import { Controller, Post, Get, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { NotesService } from './notes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('workflow')
@UseGuards(JwtAuthGuard)
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Post('tenders/:tenderId/notes')
  async addNote(
    @Param('tenderId') tenderId: string,
    @Body() body: { noteText: string },
    @Req() req: any,
  ) {
    return this.notes.addNote(tenderId, req.user.sub, body.noteText);
  }

  @Get('tenders/:tenderId/notes')
  async listNotes(
    @Param('tenderId') tenderId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.notes.listNotes(
      tenderId,
      parseInt(page || '1', 10),
      Math.min(parseInt(pageSize || '50', 10), 100),
    );
  }
}
