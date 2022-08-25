import { subtask } from 'hardhat/config';
import { TASK_COMPILE_SOLIDITY_COMPILE_JOBS } from 'hardhat/builtin-tasks/task-names';
import fs from 'fs/promises';

subtask(TASK_COMPILE_SOLIDITY_COMPILE_JOBS, 'Clean tests from types if needed').setAction(async (taskArgs, { run }, runSuper) => {
  const compileSolOutput = await runSuper(taskArgs);
  if (!!process.env.PUBLISHING_NPM) {
    console.log('🫠 Removing all test references from typechain');
    // Cleaning typechained/index
    console.log(`  🧹 Excluding from main index`);
    const typechainIndexBuffer = await fs.readFile('./typechained/index.ts');
    const finalTypechainIndex = typechainIndexBuffer
      .toString('utf-8')
      .split(/\r?\n/)
      .filter((line) => !line.includes('test'))
      .join('\n');
    await fs.writeFile('./typechained/index.ts', finalTypechainIndex, 'utf-8');
    // Cleaning typechained/solidity/contracts/index
    console.log(`  🧹 Excluding from contracts index`);
    const typechainContractsIndex = await fs.readFile('./typechained/solidity/contracts/index.ts');
    const finalTypechainContractsIndex = typechainContractsIndex
      .toString('utf-8')
      .split(/\r?\n/)
      .filter((line) => !line.includes('test'))
      .join('\n');
    await fs.writeFile('./typechained/solidity/contracts/index.ts', finalTypechainContractsIndex, 'utf-8');
    // Cleaning typechained/factories/contracts/index
    console.log(`  🧹 Excluding from factories contract's index`);
    const typechainFactoriesIndexBuffer = await fs.readFile('./typechained/factories/solidity/contracts/index.ts');
    const finalTypechainFactoriesIndex = typechainFactoriesIndexBuffer
      .toString('utf-8')
      .split(/\r?\n/)
      .filter((line) => !line.includes('test'))
      .join('\n');
    await fs.writeFile('./typechained/factories/solidity/contracts/index.ts', finalTypechainFactoriesIndex, 'utf-8');
  }
  return compileSolOutput;
});
