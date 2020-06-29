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

contract QuadVoteTallyVerifier {

    using Pairing for *;

    uint256 constant SNARK_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 constant PRIME_Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    struct VerifyingKey {
        Pairing.G1Point alfa1;
        Pairing.G2Point beta2;
        Pairing.G2Point gamma2;
        Pairing.G2Point delta2;
        Pairing.G1Point[10] IC;
    }

    struct Proof {
        Pairing.G1Point A;
        Pairing.G2Point B;
        Pairing.G1Point C;
    }

    function verifyingKey() internal pure returns (VerifyingKey memory vk) {
        vk.alfa1 = Pairing.G1Point(uint256(4159590209490568049102008795904228831305904306978291975825059503069488439237), uint256(7589663743842810498061026667142230607502646248620128410427557117438922573635));
        vk.beta2 = Pairing.G2Point([uint256(6425630241110209672998943719517537538958269757836661344907672849355156271252), uint256(15720613250632887850885463076286039849945601851420413284516335287255923267841)], [uint256(1916182639218783417675795292670890211024395610691430513984214970240872890359), uint256(12888680832506886792654769722324469310076579990961732270293684526843643851208)]);
        vk.gamma2 = Pairing.G2Point([uint256(11166194859694633523343989854806075984917955059766541054949297137880707985487), uint256(17245146858765028689099428409542728795720485338322598928543076917463742792519)], [uint256(17253265585825580894567477165034319214110718307194454660306097024254408429627), uint256(11706848312247783126670050296401977684623995164426326143897732654926243361550)]);
        vk.delta2 = Pairing.G2Point([uint256(10192849391478013938552590747179400416879980687621229443116927024530731282863), uint256(2145209319737547768902759509577796801063790713756400207252832314517038113243)], [uint256(7949957225934620133319708575278742037158050618102682513303067615334893939836), uint256(4678632843167981737383870009835653455507459433039823882531340825566062222965)]);
        vk.IC[0] = Pairing.G1Point(uint256(15139025452324918622490324536741433836100916464465798855452323955306359052605), uint256(14079923212446886747051465360105023979384944933517610689015341959217865393780));
        vk.IC[1] = Pairing.G1Point(uint256(11044110324633881419020043760301897767396118851121729893117697912186113956828), uint256(10919269012505740237116920988746650261556635849115743768928887963427571848915));
        vk.IC[2] = Pairing.G1Point(uint256(17448344195097876269695294703312636759950261611176777030757369823414249320030), uint256(12819765643864624614169872553402171852651267909492168171458607553248487203931));
        vk.IC[3] = Pairing.G1Point(uint256(3937914476047594062613702335124269700991071288682652471112495691235508754132), uint256(9460192381976185991236832527639701668326130624163634360001996107646001953281));
        vk.IC[4] = Pairing.G1Point(uint256(2656985048754776992274833440147918993811309254915243875869020412549229728921), uint256(10974653203546737318207938309369037046257741290463305002904389912256287242272));
        vk.IC[5] = Pairing.G1Point(uint256(15464041608981042620540302959217959501383626447098781319914146872271533948507), uint256(7370199223388975232472925413431803395580428868094779231337725850700307562300));
        vk.IC[6] = Pairing.G1Point(uint256(14784047432763347664896397999261572659467705801584643589688507557056960323409), uint256(20488998056114257424759222229308292470433150295743255702922827445367457057816));
        vk.IC[7] = Pairing.G1Point(uint256(17914516146451466274077509861841563975255928935101281652981007545512290937400), uint256(8284479544137753582945514452142133882815569558115782659269668282677692038213));
        vk.IC[8] = Pairing.G1Point(uint256(4942571311359783232756723183244167478569526155381116462668758146737244237028), uint256(13658788125538414031434510605383620608384216085051798633868494793932942777059));
        vk.IC[9] = Pairing.G1Point(uint256(1646614770739324011155578171206134319394127062519101850906543934884290529084), uint256(20104871075494256182629813311012287757781723085874255658725637467832241303973));

    }
    
    /*
     * @returns Whether the proof is valid given the hardcoded verifying key
     *          above and the public inputs
     */
    function verifyProof(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[9] memory input
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
        for (uint256 i = 0; i < input.length; i++) {
            require(input[i] < SNARK_SCALAR_FIELD,"verifier-gte-snark-scalar-field");
            vk_x = Pairing.plus(vk_x, Pairing.scalar_mul(vk.IC[i + 1], input[i]));
        }

        vk_x = Pairing.plus(vk_x, vk.IC[0]);

        return Pairing.pairing(
            Pairing.negate(proof.A),
            proof.B,
            vk.alfa1,
            vk.beta2,
            vk_x,
            vk.gamma2,
            proof.C,
            vk.delta2
        );
    }
}
