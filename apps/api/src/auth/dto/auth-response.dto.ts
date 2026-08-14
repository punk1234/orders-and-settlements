import { ApiProperty } from '@nestjs/swagger';

export class UserDto {
  @ApiProperty({ example: '66c1f2a1e2b4a7f1d8c9a001' })
  id!: string;

  @ApiProperty({ example: 'jane@acme.com' })
  email!: string;
}

// Response shape for signup / login / me — all three return { user }.
export class AuthResponseDto {
  @ApiProperty({ type: UserDto })
  user!: UserDto;
}

export class LogoutResponseDto {
  @ApiProperty({ example: true })
  ok!: boolean;
}
