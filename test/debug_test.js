const { ethers } = require('hardhat');

describe('VeChain deploy fix', function () {
  it('attach to correct address fixes connect', async function () {
    const accounts = await ethers.getSigners();
    const [holder, other] = accounts;
    
    const tokenRaw = await ethers.deployContract('$ERC20', ['Test', 'TST']);
    const correctAddr = await tokenRaw.getAddress();
    console.log('raw token.target:', tokenRaw.target);
    console.log('correct addr:', correctAddr);
    
    // Fix: attach to correct address
    const token = tokenRaw.attach(correctAddr);
    console.log('fixed token.target:', token.target);
    
    await token.$_mint(holder, 1000n);
    console.log('totalSupply:', (await token.totalSupply()).toString());
    
    const tx = await token.connect(holder).approve(other, 500n);
    await tx.wait();
    
    const allowance = await token.allowance(holder, other);
    console.log('allowance after approve:', allowance.toString());
    
    // Test transfer
    const tx2 = await token.connect(holder).transfer(other, 200n);
    await tx2.wait();
    
    console.log('holder balance:', (await token.balanceOf(holder)).toString());
    console.log('other balance:', (await token.balanceOf(other)).toString());
  });
});
