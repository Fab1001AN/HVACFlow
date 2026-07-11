import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  WsTaskCreated,
  WsTaskStatusChanged,
  WsTaskUpdated,
  WsPartProgressChanged,
  WsUnitProgressChanged,
  WsChecklistUpdated,
} from '@hvacflow/shared-types';

@Injectable()
@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/realtime',
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth['token'] ||
        client.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('app.jwt.accessSecret'),
      });

      // Store user info on socket for later use
      client.data['userId'] = payload.sub;
      client.data['departmentIds'] = payload.departmentIds as string[];

      // Auto-join department rooms
      const deptIds = payload.departmentIds as string[];
      for (const deptId of deptIds) {
        await client.join(`dept:${deptId}`);
      }
      // Join user room for personal notifications
      await client.join(`user:${payload.sub}`);

      this.logger.log(`Client connected: ${client.id} (user: ${payload.sub})`);
    } catch {
      this.logger.warn(`Unauthorized WebSocket connection attempt: ${client.id}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /** Subscribe to a specific unit's progress */
  @SubscribeMessage('subscribe:unit')
  async subscribeUnit(@ConnectedSocket() client: Socket, @MessageBody() unitId: string) {
    await client.join(`unit:${unitId}`);
  }

  /** Subscribe to a specific task's updates */
  @SubscribeMessage('subscribe:task')
  async subscribeTask(@ConnectedSocket() client: Socket, @MessageBody() taskId: string) {
    await client.join(`task:${taskId}`);
  }

  @SubscribeMessage('unsubscribe:unit')
  async unsubscribeUnit(@ConnectedSocket() client: Socket, @MessageBody() unitId: string) {
    await client.leave(`unit:${unitId}`);
  }

  // ─── Emit helpers called by ProductionTasksService ────────────────────────

  emitTaskCreated(departmentId: string, payload: WsTaskCreated) {
    this.server.to(`dept:${departmentId}`).emit('task.created', payload);
  }

  emitTaskStatusChanged(departmentId: string, taskId: string, payload: WsTaskStatusChanged) {
    this.server.to(`dept:${departmentId}`).emit('task.statusChanged', payload);
    this.server.to(`task:${taskId}`).emit('task.statusChanged', payload);
  }

  emitTaskUpdated(departmentId: string, taskId: string, payload: WsTaskUpdated) {
    this.server.to(`dept:${departmentId}`).emit('task.updated', payload);
    this.server.to(`task:${taskId}`).emit('task.updated', payload);
  }

  emitPartProgressChanged(unitId: string, payload: WsPartProgressChanged) {
    this.server.to(`unit:${unitId}`).emit('part.progressChanged', payload);
    // Also broadcast to all departments (supervisors watching full board)
    this.server.emit('part.progressChanged', payload);
  }

  emitUnitProgressChanged(unitId: string, payload: WsUnitProgressChanged) {
    this.server.to(`unit:${unitId}`).emit('unit.progressChanged', payload);
    this.server.emit('unit.progressChanged', payload);
  }

  emitChecklistUpdated(taskId: string, payload: WsChecklistUpdated) {
    this.server.to(`task:${taskId}`).emit('checklist.updated', payload);
  }
}
