import { Ban, CircleCheck, CircleDashed, Clock, Factory, PackageCheck, Truck, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { FULFILLMENT_STATUS_LABEL, PAYMENT_STATUS_LABEL, type FulfillmentStatus, type PaymentStatus } from "@/lib/domain/status";

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
      <div>
        <h1 className="text-xl font-bold">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Panel({ title, children, actions, className }: { title?: string; children: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border bg-white", className)}>
      {title ? (
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="font-bold">{title}</h2>
          {actions}
        </div>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}

const PAYMENT_ICON: Record<PaymentStatus, React.ComponentType<{ className?: string }>> = {
  draft: CircleDashed,
  pending: Clock,
  paid: CircleCheck,
  partially_refunded: Undo2,
  refunded: Undo2,
  canceled: Ban,
};
const PAYMENT_STYLE: Record<PaymentStatus, string> = {
  draft: "bg-surface text-muted-foreground",
  pending: "bg-warn-soft text-warn",
  paid: "bg-ok-soft text-ok",
  partially_refunded: "bg-[#eef3fb] text-brand",
  refunded: "bg-surface text-muted-foreground",
  canceled: "bg-surface text-muted-foreground",
};

/** 状態のバッジ（色だけでなく、アイコンと文字で区別する） */
export function PaymentBadge({ status }: { status: string }) {
  const s = status as PaymentStatus;
  const Icon = PAYMENT_ICON[s] ?? CircleDashed;
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-bold", PAYMENT_STYLE[s])}>
      <Icon className="size-3.5" aria-hidden />
      {PAYMENT_STATUS_LABEL[s] ?? status}
    </span>
  );
}

const FULFILLMENT_ICON: Record<FulfillmentStatus, React.ComponentType<{ className?: string }>> = {
  accepted: CircleCheck,
  in_production: Factory,
  delivered: PackageCheck,
  shipped: Truck,
  canceled: Ban,
  provided: PackageCheck,
};

export function FulfillmentBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  const s = status as FulfillmentStatus;
  const Icon = FULFILLMENT_ICON[s] ?? CircleDashed;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-surface px-2 py-0.5 text-xs font-bold">
      <Icon className="size-3.5" aria-hidden />
      {FULFILLMENT_STATUS_LABEL[s] ?? status}
    </span>
  );
}

export function Stat({ label, value, note, href }: { label: string; value: React.ReactNode; note?: string; href?: string }) {
  const body = (
    <>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}
    </>
  );
  return href ? (
    <a href={href} className="block rounded-xl border bg-white p-4 hover:border-brand">{body}</a>
  ) : (
    <div className="rounded-xl border bg-white p-4">{body}</div>
  );
}

export const inputClass = "h-9 rounded-md border border-input bg-white px-2.5 text-sm";
export const selectClass = "h-9 rounded-md border border-input bg-white px-2 text-sm";
