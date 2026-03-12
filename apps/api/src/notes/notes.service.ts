import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('workflow-stats') private readonly statsQueue: Queue,
  ) {}

  async addNote(tenderId: string, userId: string, noteText: string) {
    const tender = await this.prisma.tender.findUnique({ where: { id: tenderId } });
    if (!tender) throw new NotFoundException('Tender not found');

    const note = await this.prisma.$transaction(async (tx) => {
      const created = await tx.tenderNote.create({
        data: { tenderId, userId, noteText },
      });

      await tx.tenderActivityLog.create({
        data: {
          tenderId,
          userId,
          actionType: 'NOTE_ADDED',
          metadataJson: { noteId: created.id },
        },
      });

      return created;
    });

    await this.statsQueue.add('stats', {
      userId,
      tenderId,
      actionType: 'NOTE_ADDED',
      stage: null,
    });

    return note;
  }

  async listNotes(tenderId: string, page: number = 1, pageSize: number = 50) {
    const where = { tenderId };
    const [total, items] = await Promise.all([
      this.prisma.tenderNote.count({ where }),
      this.prisma.tenderNote.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              profile: { select: { fullName: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { page, pageSize, total, items };
  }
}