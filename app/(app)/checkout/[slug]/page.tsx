import CheckoutClient from "./CheckoutClient";
import { MercadoPagoProvider } from "@/components/MercadoPagoProvider";

export default function CheckoutPage() {
  return (
    <MercadoPagoProvider>
      <CheckoutClient />
    </MercadoPagoProvider>
  );
}
