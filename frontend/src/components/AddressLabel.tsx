import { getContact } from "../store";

interface Props {
  address: string;
  full?: boolean;
}

export default function AddressLabel({ address, full }: Props) {
  const name = getContact(address);
  const short = `${address.slice(0, 8)}...${address.slice(-4)}`;
  const display = full ? address : short;

  if (name) {
    return (
      <span className="address-label" title={address}>
        <span className="contact-name">{name}</span>
        {" "}
        <span className="mono dim">({short})</span>
      </span>
    );
  }

  return (
    <span className="address-label mono" title={address}>
      {display}
    </span>
  );
}
