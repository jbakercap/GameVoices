import React from 'react';
import Svg, { Rect, Circle, Path, G, Defs, RadialGradient, Stop } from 'react-native-svg';

interface Props {
  /** Height in points — width scales proportionally (aspect ratio 2048:1713) */
  size?: number;
}

const ASPECT = 2048 / 1713;

export function GameVoicesLogo({ size = 80 }: Props) {
  const width = size * ASPECT;
  const height = size;

  return (
    <Svg width={width} height={height} viewBox="0 0 2048 1713">
      <Defs>
        <RadialGradient id="gvbg" cx="50%" cy="38%" r="62%">
          <Stop offset="0%" stopColor="#2a2b30" />
          <Stop offset="55%" stopColor="#141519" />
          <Stop offset="100%" stopColor="#020204" />
        </RadialGradient>
      </Defs>
      <Circle cx={1028.52} cy={808.06} r={757.04} fill="url(#gvbg)" />
      <G fill="#ffffff" fillRule="evenodd">
        <Path d="M 1162.0 714.0 L 816.0 715.0 L 755.0 829.0 L 1030.0 829.0 L 1031.0 832.0 L 814.0 1257.0 L 883.0 1257.0 Z" />
        <Path d="M 1587.0 442.0 L 1454.0 442.0 L 1246.0 954.0 L 1243.0 953.0 L 1189.0 817.0 L 1121.0 957.0 L 1181.0 1093.0 L 1314.0 1092.0 Z" />
        <Path d="M 837.0 437.0 L 774.0 439.0 L 705.0 455.0 L 649.0 480.0 L 586.0 526.0 L 543.0 575.0 L 512.0 630.0 L 492.0 692.0 L 484.0 753.0 L 487.0 816.0 L 502.0 879.0 L 529.0 938.0 L 567.0 989.0 L 613.0 1031.0 L 666.0 1064.0 L 727.0 1087.0 L 796.0 1098.0 L 812.0 1097.0 L 872.0 976.0 L 824.0 985.0 L 787.0 984.0 L 752.0 977.0 L 732.0 970.0 L 696.0 950.0 L 664.0 924.0 L 643.0 900.0 L 625.0 873.0 L 614.0 849.0 L 604.0 816.0 L 600.0 787.0 L 604.0 725.0 L 615.0 688.0 L 634.0 650.0 L 658.0 619.0 L 701.0 583.0 L 740.0 563.0 L 788.0 551.0 L 833.0 550.0 L 874.0 557.0 L 919.0 576.0 L 947.0 596.0 L 1098.0 596.0 L 1061.0 545.0 L 1027.0 512.0 L 986.0 483.0 L 944.0 462.0 L 911.0 450.0 L 878.0 442.0 Z" />
        <Path d="M 1384.0 277.0 L 1315.0 277.0 L 1313.0 279.0 L 1253.0 397.0 L 1240.0 420.0 L 1225.0 451.0 L 1223.0 453.0 L 1195.0 509.0 L 1193.0 511.0 L 1183.0 532.0 L 1171.0 553.0 L 1166.0 565.0 L 1149.0 596.0 L 1220.0 596.0 Z" />
      </G>
    </Svg>
  );
}
