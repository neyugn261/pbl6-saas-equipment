import { Module } from '@nestjs/common';
import { InternalUsersController } from './internal-users.controller';
import { InternalUsersService } from './internal-users.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  controllers: [InternalUsersController],
  providers: [InternalUsersService],
})
export class InternalModule {}
