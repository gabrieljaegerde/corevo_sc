import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const CorevoModule = buildModule("CorevoModule", (m) => {
  const corevo = m.contract("Corevo");
  return { corevo };
});

export default CorevoModule;
