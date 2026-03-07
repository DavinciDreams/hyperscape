import { expect } from "chai";
import { ethers } from "hardhat";

describe("AgentPerpEngineNative — security regressions", function () {
  it("realizes PnL only on the closed portion of a position", async function () {
    const [owner, trader] = await ethers.getSigners();
    const agentId = ethers.encodeBytes32String("MODEL_A");
    const otherAgentId = ethers.encodeBytes32String("MODEL_B");

    const SkillOracle = await ethers.getContractFactory("SkillOracle");
    const oracle = await SkillOracle.connect(owner).deploy(
      ethers.parseEther("100"),
    );
    await oracle.waitForDeployment();

    await oracle.connect(owner).updateAgentSkill(agentId, 1500, 0);
    await oracle.connect(owner).updateAgentSkill(otherAgentId, 1500, 0);

    const AgentPerpEngineNative = await ethers.getContractFactory(
      "AgentPerpEngineNative",
    );
    const engine = await AgentPerpEngineNative.connect(owner).deploy(
      await oracle.getAddress(),
      ethers.parseEther("1000000000000"),
    );
    await engine.waitForDeployment();

    await engine
      .connect(trader)
      .modifyPosition(agentId, ethers.parseEther("1"), {
        value: ethers.parseEther("30"),
      });
    const initialPosition = await engine.positions(agentId, trader.address);

    await oracle.connect(owner).updateAgentSkill(agentId, 1750, 0);

    await engine
      .connect(trader)
      .modifyPosition(agentId, -ethers.parseEther("0.2"));

    const position = await engine.positions(agentId, trader.address);
    expect(position.size).to.equal(ethers.parseEther("0.8"));
    expect(position.entryPrice).to.equal(initialPosition.entryPrice);
    expect(position.margin).to.be.closeTo(
      ethers.parseEther("35"),
      ethers.parseEther("0.001"),
    );
  });

  it("blocks margin withdrawals that would exceed max leverage", async function () {
    const [owner, trader] = await ethers.getSigners();
    const agentId = ethers.encodeBytes32String("MODEL_A");

    const SkillOracle = await ethers.getContractFactory("SkillOracle");
    const oracle = await SkillOracle.connect(owner).deploy(
      ethers.parseEther("100"),
    );
    await oracle.waitForDeployment();

    await oracle.connect(owner).updateAgentSkill(agentId, 1500, 0);

    const AgentPerpEngineNative = await ethers.getContractFactory(
      "AgentPerpEngineNative",
    );
    const engine = await AgentPerpEngineNative.connect(owner).deploy(
      await oracle.getAddress(),
      ethers.parseEther("1000000"),
    );
    await engine.waitForDeployment();

    await engine
      .connect(trader)
      .modifyPosition(agentId, ethers.parseEther("5"), {
        value: ethers.parseEther("101"),
      });

    await expect(
      engine.connect(trader).withdrawMargin(agentId, ethers.parseEther("80")),
    ).to.be.revertedWith("Max leverage exceeded");
  });
});
