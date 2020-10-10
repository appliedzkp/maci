interface SnarkProof {
    pi_a: BigInt[];
    pi_b: BigInt[][];
    pi_c: BigInt[];
}

import {
    deployMaci,
    deployFreeForAllSignUpGatekeeper,
    deployConstantInitialVoiceCreditProxy,
} from './'

const formatProofForVerifierContract = (
    _proof: SnarkProof,
) => {

    return ([
        _proof.pi_a[0],
        _proof.pi_a[1],
        _proof.pi_b[0][1],
        _proof.pi_b[0][0],
        _proof.pi_b[1][1],
        _proof.pi_b[1][0],
        _proof.pi_c[0],
        _proof.pi_c[1],
    ]).map((x) => x.toString())
}

const deployTestContracts = async (
    deployer,
    initialVoiceCreditBalance,
) => {
    const freeForAllSignUpGatekeeperContract = await deployFreeForAllSignUpGatekeeper(deployer)
    const constantIntialVoiceCreditProxyContract = await deployConstantInitialVoiceCreditProxy(
        deployer,
        initialVoiceCreditBalance,
    )

    const contracts = await deployMaci(
        deployer,
        freeForAllSignUpGatekeeperContract.address,
        constantIntialVoiceCreditProxyContract.address,
    )

    const maciContract = contracts.maciContract

    return {
        freeForAllSignUpGatekeeperContract,
        constantIntialVoiceCreditProxyContract,
        maciContract,
    }
}

export {
    deployTestContracts,
    formatProofForVerifierContract,
}
