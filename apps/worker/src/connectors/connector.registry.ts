import { Injectable } from '@nestjs/common';
import { IConnector } from './connector.interface';
import { NicGepConnector } from './nicgep.connector';
import { CpppConnector } from './cppp.connector';
import { NprocureConnector } from './nprocure.connector';
import { IrepsConnector } from './ireps.connector';
import { EtendersConnector } from './etenders.connector';

@Injectable()
export class ConnectorRegistry {
  private readonly connectors: Map<string, IConnector>;

  constructor(
    private readonly nicgep: NicGepConnector,
    private readonly cppp: CpppConnector,
    private readonly nprocure: NprocureConnector,
    private readonly ireps: IrepsConnector,
    private readonly etenders: EtendersConnector,
  ) {
    this.connectors = new Map<string, IConnector>([
      ['NIC_GEP', this.nicgep],
      ['CPPP', this.etenders],  // CPPP now uses etenders.gov.in connector
      ['NPROCURE', this.nprocure],
      ['IREPS', this.ireps],
      ['CUSTOM_HTML', this.nicgep],
    ]);
  }

  get(siteType: string): IConnector | null {
    return this.connectors.get(siteType) || null;
  }
}