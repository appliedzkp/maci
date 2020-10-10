// Copyright 2017 Christian Reitwiessner
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
// IN THE SOFTWARE.

// 2019 OKIMS

pragma solidity ^0.5.0;

library Pairing {

    uint256 constant PRIME_Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    struct G1Point {
        uint256 X;
        uint256 Y;
    }

    // Encoding of field elements is: X[0] * z + X[1]
    struct G2Point {
        uint256[2] X;
        uint256[2] Y;
    }

    /*
     * @return The negation of p, i.e. p.plus(p.negate()) should be zero. 
     */
    function negate(G1Point memory p) internal pure returns (G1Point memory) {

        // The prime q in the base field F_q for G1
        if (p.X == 0 && p.Y == 0) {
            return G1Point(0, 0);
        } else {
            return G1Point(p.X, PRIME_Q - (p.Y % PRIME_Q));
        }
    }

    /*
     * @return The sum of two points of G1
     */
    function plus(
        G1Point memory p1,
        G1Point memory p2
    ) internal view returns (G1Point memory r) {

        uint256[4] memory input;
        input[0] = p1.X;
        input[1] = p1.Y;
        input[2] = p2.X;
        input[3] = p2.Y;
        bool success;

        // solium-disable-next-line security/no-inline-assembly
        assembly {
            success := staticcall(sub(gas, 2000), 6, input, 0xc0, r, 0x60)
            // Use "invalid" to make gas estimation work
            switch success case 0 { invalid() }
        }

        require(success,"pairing-add-failed");
    }

    /*
     * @return The product of a point on G1 and a scalar, i.e.
     *         p == p.scalar_mul(1) and p.plus(p) == p.scalar_mul(2) for all
     *         points p.
     */
    function scalar_mul(G1Point memory p, uint256 s) internal view returns (G1Point memory r) {

        uint256[3] memory input;
        input[0] = p.X;
        input[1] = p.Y;
        input[2] = s;
        bool success;
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            success := staticcall(sub(gas, 2000), 7, input, 0x80, r, 0x60)
            // Use "invalid" to make gas estimation work
            switch success case 0 { invalid() }
        }
        require (success,"pairing-mul-failed");
    }

    /* @return The result of computing the pairing check
     *         e(p1[0], p2[0]) *  .... * e(p1[n], p2[n]) == 1
     *         For example,
     *         pairing([P1(), P1().negate()], [P2(), P2()]) should return true.
     */
    function pairing(
        G1Point memory a1,
        G2Point memory a2,
        G1Point memory b1,
        G2Point memory b2,
        G1Point memory c1,
        G2Point memory c2,
        G1Point memory d1,
        G2Point memory d2
    ) internal view returns (bool) {

        G1Point[4] memory p1 = [a1, b1, c1, d1];
        G2Point[4] memory p2 = [a2, b2, c2, d2];

        uint256 inputSize = 24;
        uint256[] memory input = new uint256[](inputSize);

        for (uint256 i = 0; i < 4; i++) {
            uint256 j = i * 6;
            input[j + 0] = p1[i].X;
            input[j + 1] = p1[i].Y;
            input[j + 2] = p2[i].X[0];
            input[j + 3] = p2[i].X[1];
            input[j + 4] = p2[i].Y[0];
            input[j + 5] = p2[i].Y[1];
        }

        uint256[1] memory out;
        bool success;

        // solium-disable-next-line security/no-inline-assembly
        assembly {
            success := staticcall(sub(gas, 2000), 8, add(input, 0x20), mul(inputSize, 0x20), out, 0x20)
            // Use "invalid" to make gas estimation work
            switch success case 0 { invalid() }
        }

        require(success,"pairing-opcode-failed");

        return out[0] != 0;
    }
}

contract QuadVoteTallyVerifierSmall {

    using Pairing for *;

    uint256 constant SNARK_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 constant PRIME_Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    struct VerifyingKey {
        Pairing.G1Point alpha1;
        Pairing.G2Point beta2;
        Pairing.G2Point gamma2;
        Pairing.G2Point delta2;
        Pairing.G1Point[11] IC;
    }

    struct Proof {
        Pairing.G1Point A;
        Pairing.G2Point B;
        Pairing.G1Point C;
    }

    function verifyingKey() internal pure returns (VerifyingKey memory vk) {
        vk.alpha1 = Pairing.G1Point(uint256(18068464222223993076911353611817653190855087313837695292389750077606635036205),uint256(10991243083138619491635615299647463598812844008340898678128343486298651331622));
        vk.beta2 = Pairing.G2Point([uint256(19915720977742852321145743468977548918643134965432774453156411167335666017681),uint256(6045928940946297445088158266750169877482287311494661095391745935970837994274)], [uint256(9141221464716540322143724334744777703618225560679178231190715175410561524347),uint256(117927070966278017048512006096108170545262378645705856983632546379184616925)]);
        vk.gamma2 = Pairing.G2Point([uint256(9045887364868643035648117083213315298623325239193721193757597845463132907300),uint256(12982043092203309406436379932464393226360044549146061073595196695975208746816)], [uint256(5545522934195734646039381847221523653356267111099675493583931027164286091184),uint256(6401375981721931897953654041110476057162447933837200596286081649110906903073)]);
        vk.delta2 = Pairing.G2Point([uint256(17658930572090724281769746286296934216532999716209028816719361621519583670740),uint256(13929570723568809638528054688073296168511668596527815155952362135937084307004)], [uint256(16507607754668746621818564862276485526454787564181277507871944159668817252891),uint256(14722666141169167100788210235654650079455864375299761420688761202560772212878)]);
        vk.IC[0] = Pairing.G1Point(uint256(13758137535093286173686293374562132411482707418291173330647909325011502932977),uint256(21192196789799066467014692237028976550454535803817802625912719000547810305632));
        vk.IC[1] = Pairing.G1Point(uint256(4278334021394720716937941223283999554618420542664768939128621262212897192091),uint256(10397537917566553219566862260251679911422577616744571321172849242287602035652));
        vk.IC[2] = Pairing.G1Point(uint256(2219306254981399957564359121845288445384812210706215711561287501916801332454),uint256(20867447002482112932598775509764568113892397078580661658246866482871526456027));
        vk.IC[3] = Pairing.G1Point(uint256(16407045692651791847699506773728285814820616557846058630732037432300223842360),uint256(6772870643517046435435577391126679180607967071907414754419733616253131951283));
        vk.IC[4] = Pairing.G1Point(uint256(4292879700172866305586362668710331157795954122595858686863820052253580573631),uint256(8341636204452595765807389848088885116983020836549594298386939058068688493900));
        vk.IC[5] = Pairing.G1Point(uint256(14869532318578030795144158549001275279442347142827819043045399008876752910775),uint256(3807377215411727423700626597300142344362047637545155759404497718146902679900));
        vk.IC[6] = Pairing.G1Point(uint256(10257505906144314958911307426240379974575818996382780464210260313166964203039),uint256(7679852999329721801798675980857814163958163833731164125141098483283287492606));
        vk.IC[7] = Pairing.G1Point(uint256(3443790553040567857431938218395389930034762227222099502297203387238273943030),uint256(4878854570652239460880676016855943147847498380543739577505537939384885627102));
        vk.IC[8] = Pairing.G1Point(uint256(12628193785299108509423464414521118340978970891892444915546509557198827150342),uint256(5544195560961782782402938753570411766899243081281916677557572942912391512687));
        vk.IC[9] = Pairing.G1Point(uint256(14615379525034924868069876654033622472826104986442092025892532304345446740722),uint256(18002969440976451459275045941131222259412522899390758320426759856539762003855));
        vk.IC[10] = Pairing.G1Point(uint256(1325603984143001578709274648080127218818753264754068789089274826893456784939),uint256(12406579481892163583693583308384166434102334093205647315950133439770841984890));

    }
    
    /*
     * @returns Whether the proof is valid given the hardcoded verifying key
     *          above and the public inputs
     */
    function verifyProof(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[] memory input
    ) public view returns (bool) {

        Proof memory proof;
        proof.A = Pairing.G1Point(a[0], a[1]);
        proof.B = Pairing.G2Point([b[0][0], b[0][1]], [b[1][0], b[1][1]]);
        proof.C = Pairing.G1Point(c[0], c[1]);

        VerifyingKey memory vk = verifyingKey();

        // Compute the linear combination vk_x
        Pairing.G1Point memory vk_x = Pairing.G1Point(0, 0);

        // Make sure that proof.A, B, and C are each less than the prime q
        require(proof.A.X < PRIME_Q, "verifier-aX-gte-prime-q");
        require(proof.A.Y < PRIME_Q, "verifier-aY-gte-prime-q");

        require(proof.B.X[0] < PRIME_Q, "verifier-bX0-gte-prime-q");
        require(proof.B.Y[0] < PRIME_Q, "verifier-bY0-gte-prime-q");

        require(proof.B.X[1] < PRIME_Q, "verifier-bX1-gte-prime-q");
        require(proof.B.Y[1] < PRIME_Q, "verifier-bY1-gte-prime-q");

        require(proof.C.X < PRIME_Q, "verifier-cX-gte-prime-q");
        require(proof.C.Y < PRIME_Q, "verifier-cY-gte-prime-q");

        // Make sure that every input is less than the snark scalar field
        //for (uint256 i = 0; i < input.length; i++) {
        for (uint256 i = 0; i < 10; i++) {
            require(input[i] < SNARK_SCALAR_FIELD,"verifier-gte-snark-scalar-field");
            vk_x = Pairing.plus(vk_x, Pairing.scalar_mul(vk.IC[i + 1], input[i]));
        }

        vk_x = Pairing.plus(vk_x, vk.IC[0]);

        return Pairing.pairing(
            Pairing.negate(proof.A),
            proof.B,
            vk.alpha1,
            vk.beta2,
            vk_x,
            vk.gamma2,
            proof.C,
            vk.delta2
        );
    }
}
