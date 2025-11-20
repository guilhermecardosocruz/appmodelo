import CheckoutClient from "./CheckoutClient";

export default function CheckoutPage({ params }: { params: { slug: string } }) {
  return <CheckoutClient slug={params.slug} />;
}
