import { utils } from 'ethers';

const { makeInterfaceId } = require('@openzeppelin/test-helpers');

export type ERC615Interface = utils.Interface | { actual: utils.Interface; inheritedFrom: utils.Interface[] };

export function getInterfaceId(interface_: ERC615Interface) {
  let functions: string[];
  if ('actual' in interface_) {
    const allInheritedFunctions = interface_.inheritedFrom.flatMap((int) => Object.keys(int.functions));
    functions = Object.keys(interface_.actual.functions).filter((func) => !allInheritedFunctions.includes(func));
  } else {
    functions = Object.keys(interface_.functions);
  }
  return makeInterfaceId.ERC165(functions);
}
