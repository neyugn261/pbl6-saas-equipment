import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcryptjs';
import { IdentityEnv } from '../config/env.validation';

@Injectable()
export class PasswordService {
  private readonly cost: number;
  /**
   * Compared against when the account does not exist or has no password, so
   * a failed login takes about as long as one with a wrong password.
   */
  private readonly dummyHash: string;

  constructor(config: ConfigService<IdentityEnv, true>) {
    this.cost = config.get('BCRYPT_COST', { infer: true });
    this.dummyHash = bcrypt.hashSync('pbl6-dummy-password', this.cost);
  }

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.cost);
  }

  /** Returns false when `hash` is null, after spending the same work. */
  async verify(plain: string, hash: string | null): Promise<boolean> {
    const matches = await bcrypt.compare(plain, hash ?? this.dummyHash);
    return hash !== null && matches;
  }
}
