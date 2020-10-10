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

contract BatchUpdateStateTreeVerifier {

    using Pairing for *;

    uint256 constant SNARK_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 constant PRIME_Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    struct VerifyingKey {
        Pairing.G1Point alpha1;
        Pairing.G2Point beta2;
        Pairing.G2Point gamma2;
        Pairing.G2Point delta2;
        Pairing.G1Point[21] IC;
    }

    struct Proof {
        Pairing.G1Point A;
        Pairing.G2Point B;
        Pairing.G1Point C;
    }

    function verifyingKey() internal pure returns (VerifyingKey memory vk) {
        vk.alpha1 = Pairing.G1Point(uint256(15957201251639286879147720006674289172197884370826762958914450667417963049715),uint256(5447362928193142491211754739494750271964868898053808879875227864155614261253));
        vk.beta2 = Pairing.G2Point([uint256(6308269357440761227216093473512926848191111005114014244335006403968055210623),uint256(11375467367603044853649383434015658312144426891670327206596494872323570344430)], [uint256(5965560981635975934714802834369142175900764036277622069221000996505812903162),uint256(9526678237551519555622964358909394980658252207546258413427313368731699159050)]);
        vk.gamma2 = Pairing.G2Point([uint256(12248915161774477238209256661331311343968812680886787230365731200011448547558),uint256(6028698412476198090695557771733515847055043434144525643112095163547860882497)], [uint256(5578315059264780361204471560039987767272685911617255475173779890436248189532),uint256(1700834378003438984211385427432871872532075117553111044174921903150415165392)]);
        vk.delta2 = Pairing.G2Point([uint256(11885846239440611187115217650312914393811558842307296136210454865668127375404),uint256(14640552490212213838856566673075827229982469349517511911431521203016006168116)], [uint256(10275707409490767029673230055337297856939676161717959463177294267360928981436),uint256(14682809434929125496048978207220783455033921366605395624317058004604163111726)]);
        vk.IC[0] = Pairing.G1Point(uint256(21512971341413891511816199598009950648634486603089541822958589496306326200130),uint256(19018874332730336825277297211206668974959774358892812674596811592864991255918));
        vk.IC[1] = Pairing.G1Point(uint256(19643440223345062336526065433157939806622553273022150095235509294337741405907),uint256(7197465114767192007807641550894305923849176408992841235101065620176379607095));
        vk.IC[2] = Pairing.G1Point(uint256(10418985503038089303890169577605923657027771821302028389329205244870342541297),uint256(16463389753550078463438735797623243173864136928895267128047011816756156399136));
        vk.IC[3] = Pairing.G1Point(uint256(11364528191536814387074910786164575500750106226457414054528882660969199854617),uint256(15686453736721322051510898249802244350034096044237663292723200575399755460863));
        vk.IC[4] = Pairing.G1Point(uint256(11111091139974867710878040415291731880537623982799476155953661532040215720175),uint256(8327181976475030820789363223813801782991487232704267241497271991992371381537));
        vk.IC[5] = Pairing.G1Point(uint256(7852222321480481814936761315144453237312769786819073780086632266345472429510),uint256(16149984077114409541265459987175470545233431857710872079282048153637896302408));
        vk.IC[6] = Pairing.G1Point(uint256(230477527946703834955828921453499823514162137921063113997963691646048314600),uint256(19202729965702974639133681045201963781556807325363883680872512995881034826648));
        vk.IC[7] = Pairing.G1Point(uint256(20854510916986886146899355162677599823600252033083243796208875661598488308696),uint256(5185118904838282449266145876489039358696373993142033246737561038353431052987));
        vk.IC[8] = Pairing.G1Point(uint256(13300682967555928862634646314055800384890085195162462669530515762496295908527),uint256(12031691899332441948115086926830705783971177030766016117564647473182952308937));
        vk.IC[9] = Pairing.G1Point(uint256(16089311051712127195992996103013830902451243165581570782951279102479038404318),uint256(1651016289432085197163087763384788749938137701918500562481950699172635332857));
        vk.IC[10] = Pairing.G1Point(uint256(10415618411318141704410945622545742866897394627613201458972210743306079208453),uint256(43848735765533540304978463097178056768764339463228178136937418837344449308));
        vk.IC[11] = Pairing.G1Point(uint256(18465512477253565893143646444041809357283697756155519272798451840597199972135),uint256(21794103110883587300845813122173778822958348585209413091705844110719203280493));
        vk.IC[12] = Pairing.G1Point(uint256(2759488699317559305747299951775656254486273992746794030287030491595482139274),uint256(6980854733334817271813470389230680809598745244758069904197567118919942638128));
        vk.IC[13] = Pairing.G1Point(uint256(8376019338125468575705256300611612112089841972671607778667802778248364804717),uint256(6836376823039719518942027347489337221355903277984036133023800138274417358941));
        vk.IC[14] = Pairing.G1Point(uint256(11512051216724916583957414505014494510302616625729170942722236201368482657147),uint256(4596848174583282058217840120467472823953672290948064971596393096743571456699));
        vk.IC[15] = Pairing.G1Point(uint256(18845359022335618479379579802359056556291794094290640767715741954160392615628),uint256(13940354374968797233960965545718540401453728141198019059217660393570386630302));
        vk.IC[16] = Pairing.G1Point(uint256(14736049256109371863145293755103911351796431812926169663249940566520696534358),uint256(2644966214476909219837911641159610123554047215503077153008344382771751372381));
        vk.IC[17] = Pairing.G1Point(uint256(12413403537050426770727740773501128694708127316694299465430145606041843232454),uint256(13628382433389965285646860379700843644746554255151554455360259704739993476380));
        vk.IC[18] = Pairing.G1Point(uint256(21503428882064553824656230229165638481817117485723926343999860297704337641789),uint256(12862134221393413858245198074956141357618448172680218037914798095008788679219));
        vk.IC[19] = Pairing.G1Point(uint256(16079075905500107415451660853182219607820773262460026246634790205529615744576),uint256(6760782590581412018114924900876888080563185189897730498447566725937249203605));
        vk.IC[20] = Pairing.G1Point(uint256(12161246453735536093162370298027914935553514660658926946394505421702011828630),uint256(3682084593869659402153567238458081419749638299178525888435315152305045384913));

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
        for (uint256 i = 0; i < 20; i++) {
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
