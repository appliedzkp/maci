import * as Artifactor from 'truffle-artifactor'
import {
  PoseidonParams,
  POSEIDON_T3_PARAMS,
  POSEIDON_T6_PARAMS,
} from 'maci-crypto'

const poseidonGenContract = require('circomlib/src/poseidon_gencontract.js')
const artifactor = new Artifactor('compiled/')

const poseidonCreateCode = (param: PoseidonParams) => {
  return poseidonGenContract.createCode(param.t, param.roundFull, param.roundPartial, param.seed)
}

const buildPoseidonT3 = async () => {
  await artifactor.save({
    contractName: 'PoseidonT3',
    abi: poseidonGenContract.abi,
    unlinked_binary: poseidonCreateCode(POSEIDON_T3_PARAMS)
  })
}

const buildPoseidonT6 = async () => {
  await artifactor.save({
    contractName: 'PoseidonT6',
    abi: poseidonGenContract.abi,
    unlinked_binary: poseidonCreateCode(POSEIDON_T6_PARAMS)
  })
}

if (require.main === module) {
  buildPoseidonT3()
  buildPoseidonT6()
}

export { buildPoseidonT3, buildPoseidonT6 }
