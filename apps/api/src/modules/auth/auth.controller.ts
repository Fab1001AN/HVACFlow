import { Controller, Post, Get, Body, UseGuards, Request, Param } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto, RefreshTokenDto, ChangePasswordDto } from './dto/auth.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { JwtPayload } from '@hvacflow/shared-types';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @UseGuards(AuthGuard('local'))
  @Post('login')
  @ApiOperation({ summary: 'Authenticate and receive JWT tokens' })
  async login(@Request() req: { user: { id: string } }) {
    return this.authService.login(req.user.id);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  async me(@CurrentUser() user: JwtPayload) {
    return this.authService.getMe(user.sub);
  }

  @Post('change-password')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change your own password (verifies current password)' })
  async changePassword(@CurrentUser() user: JwtPayload, @Body() dto: ChangePasswordDto) {
    // Always the caller's own id from the token - never a path param - so
    // this can only ever change the authenticated user's own password.
    return this.authService.changePassword(user.sub, dto.currentPassword, dto.newPassword);
  }

  @Post('impersonate/:userId')
  @ApiBearerAuth()
  @RequirePermissions('user:manage')
  @ApiOperation({ summary: "Admin: mint a short-lived, read-only token to preview another user's dashboard" })
  async impersonate(@Param('userId') userId: string, @CurrentUser() admin: JwtPayload) {
    return this.authService.impersonate(admin.sub, userId);
  }

  @Get('impersonate/audit')
  @ApiBearerAuth()
  @RequirePermissions('user:manage')
  @ApiOperation({ summary: 'Admin: view the impersonation / "view as" audit trail' })
  async impersonationAudit() {
    return this.authService.listImpersonationAudit();
  }

  @Post('logout')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout (client should discard tokens)' })
  logout() {
    // Stateless JWT — client discards tokens. Add token blocklist here if needed.
    return { message: 'Logged out successfully' };
  }
}
