export async function deployRenderer(ethers: any, signer: any): Promise<any> {
  const Metadata = await ethers.getContractFactory("NARAArtMetadataV1", signer);
  const SecurityPrint = await ethers.getContractFactory("NARAArtSecurityPrintV1", signer);
  const metadata = await Metadata.deploy();
  const securityPrint = await SecurityPrint.deploy();
  await metadata.waitForDeployment();
  await securityPrint.waitForDeployment();

  const CorePlate = await ethers.getContractFactory("NARAArtCorePlateV1", signer);
  const GenesisPlate = await ethers.getContractFactory("NARAArtGenesisPlateV1", signer);
  const corePlate = await CorePlate.deploy(await securityPrint.getAddress());
  const genesisPlate = await GenesisPlate.deploy();
  await corePlate.waitForDeployment();
  await genesisPlate.waitForDeployment();

  const Renderer = await ethers.getContractFactory("NARAPositionRendererV5", signer);
  const renderer = await Renderer.deploy(
    await metadata.getAddress(),
    await corePlate.getAddress(),
    await genesisPlate.getAddress(),
    await securityPrint.getAddress(),
  );
  await renderer.waitForDeployment();
  return renderer;
}
