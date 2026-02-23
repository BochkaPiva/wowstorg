import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Warehouse Rental MVP</h1>
      <p className="text-zinc-600">
        Backend API for orders lifecycle is live. Use pages below to test flow quickly.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link className="rounded border border-zinc-200 bg-white p-4 hover:bg-zinc-50" href="/dev-login">
          <div className="font-medium">1) Dev Login</div>
          <div className="text-sm text-zinc-600">Set local session as Greenwich/Warehouse/Admin</div>
        </Link>
        <Link className="rounded border border-zinc-200 bg-white p-4 hover:bg-zinc-50" href="/catalog">
          <div className="font-medium">2) Catalog</div>
          <div className="text-sm text-zinc-600">Check items, availability and prices</div>
        </Link>
        <Link className="rounded border border-zinc-200 bg-white p-4 hover:bg-zinc-50" href="/my-orders">
          <div className="font-medium">3) My Orders</div>
          <div className="text-sm text-zinc-600">View Greenwich orders</div>
        </Link>
        <Link className="rounded border border-zinc-200 bg-white p-4 hover:bg-zinc-50" href="/warehouse/queue">
          <div className="font-medium">4) Warehouse Queue</div>
          <div className="text-sm text-zinc-600">Process submitted/approved/return queue</div>
        </Link>
      </div>
    </div>
  );
}
