interface OrderCardProps {
  id: string;
  total: number;
}

export function OrderCard({ id, total }: OrderCardProps) {
  return (
    <article className="order-card">
      <h2>Order {id}</h2>
      <p>Total: {total}</p>
    </article>
  );
}
