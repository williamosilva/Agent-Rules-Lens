export interface Order {
  id: string;
  total: number;
}

export class OrderService {
  private readonly orders = new Map<string, Order>();

  create(order: Order): Order {
    if (order.total < 0) {
      throw new Error('Order total cannot be negative');
    }
    this.orders.set(order.id, order);
    return order;
  }

  find(id: string): Order | undefined {
    return this.orders.get(id);
  }
}
