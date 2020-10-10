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
        vk.alpha1 = Pairing.G1Point(uint256(11105341399005612363477400552107555242417591230105078604295424777610553108857),uint256(14278990121004439932977495581663991664912085987200123515802287843462684059651));
        vk.beta2 = Pairing.G2Point([uint256(2247511060872730602990657547738043494199178352741618404963078262039715648966),uint256(2274717312835125246848143594846048437852283973946588389079799223235060730455)], [uint256(19835236408832811688460806655120204991223409195336431632658057584223520141906),uint256(8947839527670138087161728839883975730950466365501839429822205418569414787289)]);
        vk.gamma2 = Pairing.G2Point([uint256(4027730352196331115932506114728665186471516425367631983083851243630153721989),uint256(20194697145470255221200665542899819979033756975900459697943384906872418989424)], [uint256(14562249627670591588830038219947320437880893441591190389783198583939065195020),uint256(5132356020465359069065305181504611166634753750163647841210400616653672648756)]);
        vk.delta2 = Pairing.G2Point([uint256(2807293068108630634288514204488873367652686378941338411949823906068447073221),uint256(15832115637065382440585445777955476749550300387969300334202749214938830815043)], [uint256(4997900298723446536218810872505457134680971874072298494636203454028495062205),uint256(8340111625469169471391176266283413286632097942707455719512040669240684742038)]);
        vk.IC[0] = Pairing.G1Point(uint256(21000821307153022733924970574125801890576743184724473177962994240792131620786),uint256(21408340123887794505880991588338213234840737327347014874285328906066792388908));
        vk.IC[1] = Pairing.G1Point(uint256(21764893160401432682667112193407650323902027794899852275896855987655646319158),uint256(13214036745562729417875601616584065779204300292568423126820766084379718554590));
        vk.IC[2] = Pairing.G1Point(uint256(7678715964731149759048657004157414918953050271321311387738447672769228402405),uint256(9835155053036436854127464783178512168684894204632827982369899565737187668897));
        vk.IC[3] = Pairing.G1Point(uint256(7945708608627210804131275548552609980780480154861434863387102466935074649248),uint256(8580496354218103294979238589278221628082744344017172353981646986443949437935));
        vk.IC[4] = Pairing.G1Point(uint256(20160500932986499774261509552895415240020760059989855314998846893665566584407),uint256(6033001520160562060797369833323807274068378439286184134878486125274241983111));
        vk.IC[5] = Pairing.G1Point(uint256(13694861292828038570376241742797187309793707134727908836692656266593921720618),uint256(10261679100039800840417345759979226628953141925980979934508111824764649483641));
        vk.IC[6] = Pairing.G1Point(uint256(10933374862692635278752481039612665652716696516552603803585519920001868201888),uint256(3726515484253965853085851636686418852002439137019235334854830173843414440454));
        vk.IC[7] = Pairing.G1Point(uint256(6725275313577843962648929601138456483923440828509391086713809331189158220170),uint256(18229843922863685297454386078189758626828939963469316722543017116565847779011));
        vk.IC[8] = Pairing.G1Point(uint256(1992458487026581668687400703919508708229325678082222823115601630215193178041),uint256(12099690799128287017360477376273690578268064017193039303894935788358262837503));
        vk.IC[9] = Pairing.G1Point(uint256(20759263798055440269066068089431397493911139337604101566177476805811140300951),uint256(471980654317017528871845903367295255526715163824937783062684854718517053352));
        vk.IC[10] = Pairing.G1Point(uint256(4149428240592943714867252782422948404075168780231200836884310201366265511238),uint256(10763612423504662132955863806772560803881989652092412908707938216557702819341));

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
