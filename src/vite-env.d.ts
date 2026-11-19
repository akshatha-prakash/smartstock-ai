/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_APP_URL?: string;
  readonly [key: string]: string | boolean | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Ambient type definitions for @supabase/supabase-js
// Ensures the TypeScript language server never displays "Cannot find module" errors
// even before 'npm install' has been executed.
declare module '@supabase/supabase-js' {
  export interface AuthUser {
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
    app_metadata?: Record<string, unknown>;
    created_at?: string;
  }

  export interface AuthSession {
    user: AuthUser;
    access_token: string;
    refresh_token: string;
    expires_in?: number;
    expires_at?: number;
  }

  export interface AuthResponse {
    data: {
      user: AuthUser | null;
      session: AuthSession | null;
    };
    error: {
      message: string;
      status?: number;
    } | null;
  }

  export interface UserResponse {
    data: {
      user: AuthUser | null;
    };
    error: {
      message: string;
      status?: number;
    } | null;
  }

  export interface SessionResponse {
    data: {
      session: AuthSession | null;
    };
    error: {
      message: string;
      status?: number;
    } | null;
  }

  export interface PostgrestFilterBuilder<T> extends PromiseLike<{ data: T[] | null; error: any }> {
    select(columns?: string): this;
    insert(values: any): this;
    update(values: any): this;
    upsert(values: any): this;
    delete(): this;
    eq(column: string, value: any): this;
    neq(column: string, value: any): this;
    gt(column: string, value: any): this;
    gte(column: string, value: any): this;
    lt(column: string, value: any): this;
    lte(column: string, value: any): this;
    order(column: string, options?: { ascending?: boolean }): this;
    limit(count: number): this;
    range(from: number, to: number): this;
    single(): Promise<{ data: T | null; error: any }>;
    maybeSingle(): Promise<{ data: T | null; error: any }>;
  }

  export interface RealtimeChannel {
    on(event: string, filter: Record<string, unknown>, callback: (payload: any) => void): this;
    subscribe(callback?: (status: string, err?: Error) => void): this;
    unsubscribe(): Promise<'ok' | 'timed out' | 'error'>;
  }

  export interface SupabaseClient<Database = any> {
    auth: {
      signUp(credentials: {
        email: string;
        password: string;
        options?: { data?: Record<string, unknown>; emailRedirectTo?: string };
      }): Promise<AuthResponse>;
      signInWithPassword(credentials: {
        email: string;
        password: string;
      }): Promise<AuthResponse>;
      signInWithOAuth(options: {
        provider: string;
        options?: { redirectTo?: string; scopes?: string };
      }): Promise<{ data: { provider: string; url: string }; error: any }>;
      signOut(): Promise<{ error: any }>;
      getUser(): Promise<UserResponse>;
      getSession(): Promise<SessionResponse>;
      onAuthStateChange(callback: (event: string, session: AuthSession | null) => void): {
        data: {
          subscription: {
            unsubscribe(): void;
          };
        };
      };
      resetPasswordForEmail(
        email: string,
        options?: { redirectTo?: string },
      ): Promise<{ data: any; error: any }>;
    };
    from<TableName extends string = any>(
      table: TableName,
    ): PostgrestFilterBuilder<any>;
    rpc(fn: string, args?: Record<string, unknown>): Promise<{ data: any; error: any }>;
    channel(name: string): RealtimeChannel;
    removeChannel(channel: RealtimeChannel): Promise<'ok' | 'timed out' | 'error'>;
  }

  export function createClient<Database = any>(
    supabaseUrl: string,
    supabaseKey: string,
    options?: Record<string, unknown>,
  ): SupabaseClient<Database>;
}
