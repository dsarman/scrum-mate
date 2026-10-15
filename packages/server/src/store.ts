import type { Room } from '@scrum-mate/shared';

/**
 * Persistence boundary. The MVP implementation is a Map; a Postgres implementation
 * would have the same shape. See DESIGN.md section 9.
 */
export interface RoomStore {
  get(roomId: string): Promise<Room | undefined>;
  getBySlug(slug: string): Promise<Room | undefined>;
  save(room: Room): Promise<void>;
  /** Drop rooms whose lastActivityAt is older than the given time. Returns how many. */
  expireIdle(olderThan: Date): Promise<number>;
}

export class InMemoryRoomStore implements RoomStore {
  private readonly byId = new Map<string, Room>();
  private readonly idBySlug = new Map<string, string>();

  async get(roomId: string): Promise<Room | undefined> {
    return this.byId.get(roomId);
  }

  async getBySlug(slug: string): Promise<Room | undefined> {
    const id = this.idBySlug.get(slug);
    return id === undefined ? undefined : this.byId.get(id);
  }

  async save(room: Room): Promise<void> {
    this.byId.set(room.id, room);
    this.idBySlug.set(room.slug, room.id);
  }

  async expireIdle(olderThan: Date): Promise<number> {
    let dropped = 0;
    for (const room of this.byId.values()) {
      if (Date.parse(room.lastActivityAt) < olderThan.getTime()) {
        this.byId.delete(room.id);
        this.idBySlug.delete(room.slug);
        dropped++;
      }
    }
    return dropped;
  }

  get size(): number {
    return this.byId.size;
  }
}
