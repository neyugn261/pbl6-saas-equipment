import { Module } from '@nestjs/common';
import { InternalUsersController } from './internal-users.controller';
import { InternalUsersService } from './internal-users.service';
import { UsersModule } from '../users/users.module';
import { UserDisplayNamesController } from './display-names.controller';

@Module({
  imports: [UsersModule],
  controllers: [InternalUsersController, UserDisplayNamesController],
  providers: [InternalUsersService],
})
export class InternalModule {}
