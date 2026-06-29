// Shared helper: deploy the NARAPositionArtV1 library and a renderer linked to it.
// The renderer delegates all SVG/metadata building to the linked library.
const ART_FQN = "project/contracts/v4/libraries/NARAPositionArtV1.sol:NARAPositionArtV1";

export async function deployRenderer(ethers: any, signer: any): Promise<any> {
  const Art = await ethers.getContractFactory("NARAPositionArtV1", signer);
  const art = await Art.deploy();
  await art.waitForDeployment();
  const Renderer = await ethers.getContractFactory("NARAPositionRendererV4", {
    libraries: { [ART_FQN]: await art.getAddress() },
    signer,
  });
  const renderer = await Renderer.deploy();
  await renderer.waitForDeployment();
  return renderer;
}
