import { Adapters, App } from './app';
import { Message } from './message';
import path from 'path';
import { getLogger, Logger } from 'log4js';
import { Dict } from '@zhinjs/shared';
import { WORK_DIR } from './constans';
import { Schema } from './schema';
import { EventEmitter } from 'events';
const adapterKey = '__IS_ZHIN_ADAPTER__';
export type Element = {
  type: string;
  data: Dict;
};
export class Adapter<P extends keyof App.Adapters> extends EventEmitter {
  bots: Adapter.Bot<P>[] = [];
  elements: Element[] = [];
  private [adapterKey] = true;
  app: App | null = null;
  static isAdapter(obj: any): obj is Adapter {
    return typeof obj === 'object' && !!obj[adapterKey];
  }

  schemas: Schema = Schema.object({
    unique_id: Schema.string('请输入机器人唯一标识'),
    master: Schema.string('请输入主人id'),
    admins: Schema.list(Schema.string('管理员qq'), '请输入管理员id'),
    command_prefix: Schema.string('请输入指令前缀'),
    disabled_plugins: Schema.list(Schema.string('插件名'), '请输入禁用的插件').default([]),
    quote_self: Schema.boolean('回复是否引用源消息'),
  });
  #loggers: Dict<Logger> = {};
  getLogger(sub_type?: string | number): Logger {
    const logger = (this.#loggers[sub_type || this.name] ||= getLogger(
      `[${this.name}${sub_type ? ':' + sub_type : ''}]`,
    ));
    logger.level = this.app?.logger.level || 'info';
    return logger;
  }
  schema<X extends Record<string, Schema>>(schema: X) {
    Object.assign(this.schemas.options.object || {}, schema);
    return this;
  }
  get logger() {
    return this.getLogger();
  }
  constructor(public name: P) {
    super();
  }
  botConfig(unique_id: string): Adapter.BotConfig<P> | undefined {
    return this.app!.config.bots.find(config => config.unique_id === unique_id) as Adapter.BotConfig<P>;
  }
  async sendMsg(bot_id: string, channel: Message.Channel, message: string, source?: Message<P>): Promise<any> {
    return this.pick(bot_id)?.sendMsg(channel, message, source);
  }
  pick(bot_id: string): Adapter.Bot<P> {
    const bot = this.bots.find(bot => bot.unique_id === bot_id);
    if (!bot) throw new Error(`未找到Bot:${bot_id}`);
    return bot;
  }
  element(element: Element): this;
  element(type: string, data: Dict): this;
  element(...args: [Element] | [string, Dict]) {
    const element =
      typeof args[0] === 'string'
        ? {
            type: args[0],
            data: args[1]!,
          }
        : args[0];
    this.elements.push(element);
    return this;
  }
  mount(app: App) {
    this.emit('before-mount');
    this.logger.level = app.config.log_level;
    this.app = app;
    this.emit('mounted', app);
  }
  unmount() {
    this.emit('before-unmount', this.app!);
    this.app = null;
    this.emit('unmounted');
  }
}

export interface Adapter<P extends keyof App.Adapters = keyof App.Adapters> {
  on<T extends keyof Adapter.EventMap<P>>(event: T, listener: Adapter.EventMap<P>[T]): this;

  on<S extends string | symbol>(
    event: S & Exclude<string | symbol, keyof Adapter.EventMap<P>>,
    listener: (...args: any[]) => any,
  ): this;

  off<T extends keyof Adapter.EventMap<P>>(event: T, callback?: Adapter.EventMap<P>[T]): this;

  off<S extends string | symbol>(
    event: S & Exclude<string | symbol, keyof Adapter.EventMap<P>>,
    callback?: (...args: any[]) => void,
  ): this;

  once<T extends keyof Adapter.EventMap<P>>(event: T, listener: Adapter.EventMap<P>[T]): this;

  once<S extends string | symbol>(
    event: S & Exclude<string | symbol, keyof Adapter.EventMap<P>>,
    listener: (...args: any[]) => any,
  ): this;

  emit<T extends keyof Adapter.EventMap<P>>(event: T, ...args: Parameters<Adapter.EventMap<P>[T]>): boolean;

  emit<S extends string | symbol>(
    event: S & Exclude<string | symbol, keyof Adapter.EventMap<P>>,
    ...args: any[]
  ): boolean;

  addListener<T extends keyof Adapter.EventMap<P>>(event: T, listener: Adapter.EventMap<P>[T]): this;

  addListener<S extends string | symbol>(
    event: S & Exclude<string | symbol, keyof Adapter.EventMap<P>>,
    listener: (...args: any[]) => any,
  ): this;

  addListenerOnce<T extends keyof Adapter.EventMap<P>>(event: T, callback: Adapter.EventMap<P>[T]): this;

  addListenerOnce<S extends string | symbol>(
    event: S & Exclude<string | symbol, keyof Adapter.EventMap<P>>,
    callback: (...args: any[]) => void,
  ): this;

  removeListener<T extends keyof Adapter.EventMap<P>>(event: T, callback?: Adapter.EventMap<P>[T]): this;

  removeListener<S extends string | symbol>(
    event: S & Exclude<string | symbol, keyof Adapter.EventMap<P>>,
    callback?: (...args: any[]) => void,
  ): this;

  removeAllListeners<T extends keyof Adapter.EventMap<P>>(event: T): this;

  removeAllListeners<S extends string | symbol>(event: S & Exclude<string | symbol, keyof Adapter.EventMap<P>>): this;
}
export namespace Adapter {
  export interface EventMap<P extends keyof App.Adapters> {
    'bot-ready'(bot: Bot<P>): void;
    'before-mount'(): void;
    'before-unmount'(app: App): void;
    'mounted'(app: App): void;
    'unmounted'(): void;
    'start'(configs: BotConfig<P>[]): void;
  }
  export abstract class Bot<P extends Adapters = Adapters> {
    protected constructor(
      public adapter: Adapter<P>,
      public unique_id: string,
      public internal: App.Bots[P],
    ) {
      const _this = this;
      return new Proxy(_this, {
        get(target, prop, receiver) {
          if (prop in target) return Reflect.get(target, prop, receiver);
          return Reflect.get(_this.internal, prop, receiver);
        },
      });
    }
    get command_prefix() {
      return this.adapter.botConfig(this.unique_id)?.command_prefix;
    }
    abstract handleSendMessage(channel: Message.Channel, message: string, source?: Message<P>): Promise<string>;
    async sendMsg(channel: Message.Channel, message: string, source?: Message<P>): Promise<string> {
      const renderAfter = await this.adapter.app?.renderMessage(message, source);
      return this.handleSendMessage(channel, renderAfter || message, source);
    }
    get quote_self() {
      return this.adapter.botConfig(this.unique_id)?.quote_self;
    }
    get forward_length() {
      return this.adapter.botConfig(this.unique_id)?.forward_length;
    }
  }
  export function load(name: string) {
    const maybePath = [
      path.join(WORK_DIR, 'node_modules', `@zhinjs`, name), // 官方适配器
      path.join(WORK_DIR, 'node_modules', `zhin-` + name), // 社区适配器
    ];
    for (const adapterPath of maybePath) {
      let result = null;
      try {
        result = require(adapterPath);
      } catch {}
      if (!result) continue;
      result = result.default || result;
      if (!Adapter.isAdapter(result)) throw new Error(`${adapterPath} is not an adapter`);
      return result;
    }
    throw new Error(`can't find adapter ${name}`);
  }

  export type BotConfig<T extends Adapters = Adapters> = {
    adapter: T;
    unique_id: string;
    master?: string | number;
    admins?: (string | number)[];
    command_prefix?: string;
    disabled_plugins?: string[];
    forward_length?: number;
    quote_self?: boolean;
  } & App.Adapters[T];
  export type InferAdapterPlatform<T extends Adapter> = T extends Adapter<infer P> ? P : never;
  export type InternalBot<P extends keyof App.Adapters> = App.Bots[P];
}
