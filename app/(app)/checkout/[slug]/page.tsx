import CheckoutClient from "./CheckoutClient";

type PageProps = {
  params: {
    slug: string;
  };
};

export default function CheckoutPage({ params }: PageProps) {
  return <CheckoutClient slug={params.slug} />;
}
