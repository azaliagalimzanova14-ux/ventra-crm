/**
 * Minimal type declarations for the `telegram` (GramJS) npm package.
 *
 * These stubs allow TypeScript compilation before `npm install telegram` is run.
 * Once the real package is installed, its bundled declarations take precedence
 * and these stubs are ignored.
 *
 * Run `npm install telegram` to get full type safety.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

declare module "telegram" {
  export class TelegramClient {
    session: { save(): unknown };
    constructor(session: any, apiId: number, apiHash: string, options?: any);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    sendCode(creds: { apiId: number; apiHash: string }, phone: string): Promise<{ phoneCodeHash: string; isCodeViaApp: boolean }>;
    invoke<T = any>(request: any): Promise<T>;
    getMe(): Promise<any>;
    getDialogs(options?: { limit?: number }): Promise<any[]>;
    getMessages(entity: any, options?: { limit?: number }): Promise<any[]>;
    getEntity(id: bigint | string | number): Promise<any>;
    sendMessage(entity: any, options: { message: string }): Promise<any>;
    addEventHandler(callback: (event: any) => void, event: any): void;
  }
  export const errors: Record<string, unknown>;
}

declare module "telegram/sessions" {
  export class StringSession {
    constructor(session?: string);
  }
}

declare module "telegram/tl" {
  export namespace Api {
    class PeerUser  { userId:    bigint; }
    class PeerChat  { chatId:    bigint; }
    class PeerChannel { channelId: bigint; }
    namespace auth {
      class SignIn { constructor(args: { phoneNumber: string; phoneCodeHash: string; phoneCode: string }); }
      class CheckPassword { constructor(args: { password: any }); }
    }
    namespace account {
      class GetPassword { constructor(); }
    }
  }
}

declare module "telegram/events" {
  export class NewMessage {
    constructor(options?: { chats?: any[]; func?: (event: any) => boolean });
  }
  export interface NewMessageEvent {
    message: any;
  }
}

declare module "telegram/Password" {
  export function computeCheck(passwordInfo: any, password: string): Promise<any>;
}
