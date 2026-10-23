import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { PlatformAdminsController } from './platform-admins.controller';
import { RolesController } from './roles.controller';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [UsersController, PlatformAdminsController, RolesController],
  providers: [UsersService, UsersRepository],
  exports: [UsersRepository],
})
export class UsersModule {}
