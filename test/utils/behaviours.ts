import { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import chai from 'chai';
import { Contract, ContractFactory, ContractInterface, Signer, utils, Wallet } from 'ethers';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { Provider } from '@ethersproject/providers';
import { getStatic } from 'ethers/lib/utils';
import { wallet } from '.';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { given, then, when } from './bdd';
const { makeInterfaceId } = require('@openzeppelin/test-helpers');

chai.use(chaiAsPromised);

type Impersonator = Signer | Provider | string;

export const checkTxRevertedWithMessage = async ({
  tx,
  message,
}: {
  tx: Promise<TransactionResponse>;
  message: RegExp | string;
}): Promise<void> => {
  await expect(tx).to.be.reverted;
  if (message instanceof RegExp) {
    await expect(tx).eventually.rejected.have.property('message').match(message);
  } else {
    await expect(tx).to.be.revertedWith(message);
  }
};

export const checkTxRevertedWithZeroAddress = async (tx: Promise<TransactionResponse>): Promise<void> => {
  await checkTxRevertedWithMessage({
    tx,
    message: /zero\saddress/,
  });
};

export const deployShouldRevertWithZeroAddress = async ({ contract, args }: { contract: ContractFactory; args: any[] }): Promise<void> => {
  const deployContractTx = await contract.getDeployTransaction(...args);
  const tx = contract.signer.sendTransaction(deployContractTx);
  await checkTxRevertedWithZeroAddress(tx);
};

export const deployShouldRevertWithMessage = async ({
  contract,
  args,
  message,
}: {
  contract: ContractFactory;
  args: any[];
  message: string;
}): Promise<void> => {
  const deployContractTx = await contract.getDeployTransaction(...args);
  const tx = contract.signer.sendTransaction(deployContractTx);
  await checkTxRevertedWithMessage({ tx, message });
};

export const txShouldRevertWithZeroAddress = async ({
  contract,
  func,
  args,
}: {
  contract: Contract;
  func: string;
  args: any[];
  tx?: Promise<TransactionResponse>;
}): Promise<void> => {
  const tx = contract[func](...args);
  await checkTxRevertedWithZeroAddress(tx);
};

export const txShouldRevertWithMessage = async ({
  contract,
  func,
  args,
  message,
}: {
  contract: Contract;
  func: string;
  args: any[];
  message: string;
}): Promise<void> => {
  const tx = contract[func](...args);
  await checkTxRevertedWithMessage({ tx, message });
};

export const checkTxEmittedEvents = async ({
  contract,
  tx,
  events,
}: {
  contract: Contract;
  tx: TransactionResponse;
  events: { name: string; args: any[] }[];
}): Promise<void> => {
  for (let i = 0; i < events.length; i++) {
    await expect(tx)
      .to.emit(contract, events[i].name)
      .withArgs(...events[i].args);
  }
};

export const deployShouldSetVariablesAndEmitEvents = async ({
  contract,
  args,
  settersGettersVariablesAndEvents,
}: {
  contract: ContractFactory;
  args: any[];
  settersGettersVariablesAndEvents: {
    getterFunc: string;
    variable: any;
    eventEmitted: string;
  }[];
}): Promise<void> => {
  const deployContractTx = await contract.getDeployTransaction(...args);
  const tx = await contract.signer.sendTransaction(deployContractTx);
  const address = getStatic<(tx: TransactionResponse) => string>(contract.constructor, 'getContractAddress')(tx);
  const deployedContract = getStatic<(address: string, contractInterface: ContractInterface, signer?: Signer) => Contract>(
    contract.constructor,
    'getContract'
  )(address, contract.interface, contract.signer);
  await txShouldHaveSetVariablesAndEmitEvents({
    contract: deployedContract,
    tx,
    settersGettersVariablesAndEvents,
  });
};

export const txShouldHaveSetVariablesAndEmitEvents = async ({
  contract,
  tx,
  settersGettersVariablesAndEvents,
}: {
  contract: Contract;
  tx: TransactionResponse;
  settersGettersVariablesAndEvents: {
    getterFunc: string;
    variable: any;
    eventEmitted: string;
  }[];
}): Promise<void> => {
  for (let i = 0; i < settersGettersVariablesAndEvents.length; i++) {
    await checkTxEmittedEvents({
      contract,
      tx,
      events: [
        {
          name: settersGettersVariablesAndEvents[i].eventEmitted,
          args: [settersGettersVariablesAndEvents[i].variable],
        },
      ],
    });
    expect(await contract[settersGettersVariablesAndEvents[i].getterFunc]()).to.eq(settersGettersVariablesAndEvents[i].variable);
  }
};

export const txShouldSetVariableAndEmitEvent = async ({
  contract,
  setterFunc,
  getterFunc,
  variable,
  eventEmitted,
}: {
  contract: Contract;
  setterFunc: string;
  getterFunc: string;
  variable: any;
  eventEmitted: string;
}): Promise<void> => {
  expect(await contract[getterFunc]()).to.not.eq(variable);
  const tx = contract[setterFunc](variable);
  await txShouldHaveSetVariablesAndEmitEvents({
    contract,
    tx,
    settersGettersVariablesAndEvents: [
      {
        getterFunc,
        variable,
        eventEmitted,
      },
    ],
  });
};

export const fnShouldOnlyBeCallableByGovernance = (
  delayedContract: () => Contract,
  fnName: string,
  governance: Impersonator,
  args: unknown[] | (() => unknown[])
): void => {
  it('should be callable by governance', () => {
    return expect(callFunction(governance)).not.to.be.revertedWith('OnlyGovernance()');
  });

  it('should not be callable by any address', async () => {
    return expect(callFunction(await wallet.generateRandom())).to.be.revertedWith('OnlyGovernance()');
  });

  function callFunction(impersonator: Impersonator) {
    const argsArray: unknown[] = typeof args === 'function' ? args() : args;
    const fn = delayedContract().connect(impersonator)[fnName] as (...args: unknown[]) => unknown;
    return fn(...argsArray);
  }
};

export const shouldSupportInterface = ({
  contract,
  interfaceName,
  interface: interface_,
}: {
  contract: () => Contract;
  interfaceName: string;
  interface: utils.Interface | { actual: utils.Interface; inheritedFrom: utils.Interface[] };
}) => {
  when(`asked if ${interfaceName} is supported`, () => {
    then('result is true', async () => {
      let functions: string[];
      if ('actual' in interface_) {
        const allInheritedFunctions = interface_.inheritedFrom.flatMap((int) => Object.keys(int.functions));
        functions = Object.keys(interface_.actual.functions).filter((func) => !allInheritedFunctions.includes(func));
      } else {
        functions = Object.keys(interface_.functions);
      }
      const interfaceId = makeInterfaceId.ERC165(functions);
      expect(await contract().supportsInterface(interfaceId)).to.be.true;
    });
  });
};

export const shouldNotSupportInterface = ({
  contract,
  interfaceName,
  interface: interface_,
}: {
  contract: () => Contract;
  interfaceName: string;
  interface: utils.Interface;
}) => {
  when(`asked if ${interfaceName} is supported`, () => {
    then('result is false', async () => {
      const functions = Object.keys(interface_.functions);
      const interfaceId = makeInterfaceId.ERC165(functions);
      expect(await contract().supportsInterface(interfaceId)).to.be.false;
    });
  });
};

export const shouldBeExecutableOnlyByRole = ({
  contract,
  funcAndSignature,
  params,
  addressWithRole,
  role,
}: {
  contract: () => Contract;
  funcAndSignature: string;
  params?: any[];
  addressWithRole: () => SignerWithAddress;
  role: () => string;
}) => {
  params = params ?? [];
  when('called from address without role', () => {
    let tx: Promise<TransactionResponse>;
    let walletWithoutRole: Wallet;
    given(async () => {
      walletWithoutRole = await wallet.generateRandom();
      tx = contract()
        .connect(walletWithoutRole)
        [funcAndSignature](...params!);
    });
    then('tx is reverted with reason', async () => {
      await expect(tx).to.be.revertedWith(`AccessControl: account ${walletWithoutRole.address.toLowerCase()} is missing role ${role()}`);
    });
  });
  when('called from address with role', () => {
    let tx: Promise<TransactionResponse>;
    given(async () => {
      tx = contract()
        .connect(addressWithRole())
        [funcAndSignature](...params!);
    });
    then('tx is not reverted or not reverted with reason only governor', async () => {
      await expect(tx).to.not.be.revertedWith(`AccessControl: account ${addressWithRole().address.toLowerCase()} is missing role ${role()}`);
    });
  });
};
