export type Vector3 = [number, number, number];

export type Matrix3 = [
  [number, number, number],
  [number, number, number],
  [number, number, number],
];

type Matrix4 = [
  [number, number, number, number],
  [number, number, number, number],
  [number, number, number, number],
  [number, number, number, number],
];

export interface ParsedPointPair {
  id: string;
  label: string;
  model: Vector3;
  earth: Vector3;
}

export interface PointResidual {
  id: string;
  label: string;
  predicted: Vector3;
  delta: Vector3;
  distance: number;
}

export interface TransformResult {
  scale: number;
  rotation: Matrix3;
  translation: Vector3;
  matrixColumnMajor: number[];
  residuals: PointResidual[];
  meanError: number;
  rmsError: number;
  maxError: number;
}

const EPSILON = 1e-10;

function addVector(a: Vector3, b: Vector3): Vector3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtractVector(a: Vector3, b: Vector3): Vector3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scaleVector(vector: Vector3, scale: number): Vector3 {
  return [vector[0] * scale, vector[1] * scale, vector[2] * scale];
}

function dotVector(a: Vector3, b: Vector3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function crossVector(a: Vector3, b: Vector3): Vector3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function vectorLength(vector: Vector3): number {
  return Math.sqrt(dotVector(vector, vector));
}

function multiplyMatrixVector(matrix: Matrix3, vector: Vector3): Vector3 {
  return [
    dotVector(matrix[0], vector),
    dotVector(matrix[1], vector),
    dotVector(matrix[2], vector),
  ];
}

function calculateCentroid(points: Vector3[]): Vector3 {
  const sum = points.reduce<Vector3>(
    (currentSum, point) => addVector(currentSum, point),
    [0, 0, 0],
  );

  return scaleVector(sum, 1 / points.length);
}

function hasNonCollinearPoints(points: Vector3[]): boolean {
  for (let firstIndex = 0; firstIndex < points.length - 2; firstIndex += 1) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < points.length - 1;
      secondIndex += 1
    ) {
      for (
        let thirdIndex = secondIndex + 1;
        thirdIndex < points.length;
        thirdIndex += 1
      ) {
        const firstEdge = subtractVector(
          points[secondIndex],
          points[firstIndex],
        );
        const secondEdge = subtractVector(
          points[thirdIndex],
          points[firstIndex],
        );
        const areaVector = crossVector(firstEdge, secondEdge);
        const scale =
          Math.max(vectorLength(firstEdge), vectorLength(secondEdge), 1) ** 2;

        // 三点构成的三角形面积足够大，说明点集没有全部落在一条直线上。
        if (vectorLength(areaVector) > EPSILON * scale) {
          return true;
        }
      }
    }
  }

  return false;
}

function createIdentityMatrix4(): Matrix4 {
  return [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
}

function getDominantEigenvectorOfSymmetric4(matrix: Matrix4): [
  number,
  number,
  number,
  number,
] {
  const workingMatrix: Matrix4 = matrix.map((row) => [...row]) as Matrix4;
  const eigenvectors = createIdentityMatrix4();

  // Jacobi 迭代专门用于对称矩阵：每轮消掉一个最大的非对角元素。
  for (let iteration = 0; iteration < 80; iteration += 1) {
    let pivotRow = 0;
    let pivotColumn = 1;
    let maxOffDiagonal = Math.abs(workingMatrix[pivotRow][pivotColumn]);

    for (let row = 0; row < 4; row += 1) {
      for (let column = row + 1; column < 4; column += 1) {
        const currentValue = Math.abs(workingMatrix[row][column]);

        if (currentValue > maxOffDiagonal) {
          maxOffDiagonal = currentValue;
          pivotRow = row;
          pivotColumn = column;
        }
      }
    }

    if (maxOffDiagonal < 1e-12) {
      break;
    }

    const diagonalA = workingMatrix[pivotRow][pivotRow];
    const diagonalB = workingMatrix[pivotColumn][pivotColumn];
    const pivotValue = workingMatrix[pivotRow][pivotColumn];
    const tau = (diagonalB - diagonalA) / (2 * pivotValue);
    const tangent =
      Math.sign(tau || 1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
    const cosine = 1 / Math.sqrt(1 + tangent * tangent);
    const sine = tangent * cosine;

    for (let index = 0; index < 4; index += 1) {
      if (index !== pivotRow && index !== pivotColumn) {
        const valueA = workingMatrix[index][pivotRow];
        const valueB = workingMatrix[index][pivotColumn];
        const rotatedA = cosine * valueA - sine * valueB;
        const rotatedB = sine * valueA + cosine * valueB;

        workingMatrix[index][pivotRow] = rotatedA;
        workingMatrix[pivotRow][index] = rotatedA;
        workingMatrix[index][pivotColumn] = rotatedB;
        workingMatrix[pivotColumn][index] = rotatedB;
      }
    }

    // 更新两个主对角元素；非对角 pivot 被本轮旋转消为 0。
    workingMatrix[pivotRow][pivotRow] = diagonalA - tangent * pivotValue;
    workingMatrix[pivotColumn][pivotColumn] = diagonalB + tangent * pivotValue;
    workingMatrix[pivotRow][pivotColumn] = 0;
    workingMatrix[pivotColumn][pivotRow] = 0;

    // 同步累计特征向量矩阵，最后每一列就是一个特征向量。
    for (let index = 0; index < 4; index += 1) {
      const vectorA = eigenvectors[index][pivotRow];
      const vectorB = eigenvectors[index][pivotColumn];

      eigenvectors[index][pivotRow] = cosine * vectorA - sine * vectorB;
      eigenvectors[index][pivotColumn] = sine * vectorA + cosine * vectorB;
    }
  }

  let dominantIndex = 0;

  for (let index = 1; index < 4; index += 1) {
    if (
      workingMatrix[index][index] >
      workingMatrix[dominantIndex][dominantIndex]
    ) {
      dominantIndex = index;
    }
  }

  const eigenvector: [number, number, number, number] = [
    eigenvectors[0][dominantIndex],
    eigenvectors[1][dominantIndex],
    eigenvectors[2][dominantIndex],
    eigenvectors[3][dominantIndex],
  ];
  const eigenvectorLength = Math.sqrt(
    eigenvector.reduce((sum, value) => sum + value * value, 0),
  );

  if (eigenvectorLength < EPSILON) {
    throw new Error("无法求解旋转四元数，请检查控制点分布");
  }

  const sign = eigenvector[0] < 0 ? -1 : 1;

  return [
    (sign * eigenvector[0]) / eigenvectorLength,
    (sign * eigenvector[1]) / eigenvectorLength,
    (sign * eigenvector[2]) / eigenvectorLength,
    (sign * eigenvector[3]) / eigenvectorLength,
  ];
}

function calculateRotationFromCovariance(covariance: Matrix3): Matrix3 {
  const sxx = covariance[0][0];
  const sxy = covariance[0][1];
  const sxz = covariance[0][2];
  const syx = covariance[1][0];
  const syy = covariance[1][1];
  const syz = covariance[1][2];
  const szx = covariance[2][0];
  const szy = covariance[2][1];
  const szz = covariance[2][2];
  const trace = sxx + syy + szz;

  // Horn 四元数法：把“求最优旋转矩阵”转成 4x4 对称矩阵的最大特征向量问题。
  const hornMatrix: Matrix4 = [
    [trace, syz - szy, szx - sxz, sxy - syx],
    [syz - szy, sxx - syy - szz, sxy + syx, szx + sxz],
    [szx - sxz, sxy + syx, -sxx + syy - szz, syz + szy],
    [sxy - syx, szx + sxz, syz + szy, -sxx - syy + szz],
  ];
  const [qw, qx, qy, qz] = getDominantEigenvectorOfSymmetric4(hornMatrix);

  // 把单位四元数转回 3x3 旋转矩阵；这里采用列向量约定：Q = R * P。
  return [
    [
      1 - 2 * (qy * qy + qz * qz),
      2 * (qx * qy - qz * qw),
      2 * (qx * qz + qy * qw),
    ],
    [
      2 * (qx * qy + qz * qw),
      1 - 2 * (qx * qx + qz * qz),
      2 * (qy * qz - qx * qw),
    ],
    [
      2 * (qx * qz - qy * qw),
      2 * (qy * qz + qx * qw),
      1 - 2 * (qx * qx + qy * qy),
    ],
  ];
}

function transformPoint(
  point: Vector3,
  rotation: Matrix3,
  scale: number,
  translation: Vector3,
): Vector3 {
  return addVector(
    scaleVector(multiplyMatrixVector(rotation, point), scale),
    translation,
  );
}

function createColumnMajorTransformArray(
  rotation: Matrix3,
  scale: number,
  translation: Vector3,
): number[] {
  const scaledRotation = rotation.map((row) =>
    row.map((value) => value * scale),
  ) as Matrix3;

  // 3D Tiles / Cesium 的 transform 数组按 column-major 存储。
  return [
    scaledRotation[0][0],
    scaledRotation[1][0],
    scaledRotation[2][0],
    0,
    scaledRotation[0][1],
    scaledRotation[1][1],
    scaledRotation[2][1],
    0,
    scaledRotation[0][2],
    scaledRotation[1][2],
    scaledRotation[2][2],
    0,
    translation[0],
    translation[1],
    translation[2],
    1,
  ];
}

export function estimateSimilarityTransform(
  pairs: ParsedPointPair[],
): TransformResult {
  const modelPoints = pairs.map((pair) => pair.model);
  const earthPoints = pairs.map((pair) => pair.earth);

  if (!hasNonCollinearPoints(modelPoints)) {
    throw new Error("模型坐标控制点不能全部共线");
  }

  if (!hasNonCollinearPoints(earthPoints)) {
    throw new Error("Cesium 坐标控制点不能全部共线");
  }

  // 第 1 步：分别计算两组点的质心，后续只处理相对质心的坐标。
  const modelCentroid = calculateCentroid(modelPoints);
  const earthCentroid = calculateCentroid(earthPoints);
  const covariance: Matrix3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  let modelVariance = 0;

  for (const pair of pairs) {
    const centeredModel = subtractVector(pair.model, modelCentroid);
    const centeredEarth = subtractVector(pair.earth, earthCentroid);

    modelVariance += dotVector(centeredModel, centeredModel);

    // 第 2 步：累计协方差矩阵 Σ(P' * Q'^T)，记录模型点与目标点的对应关系。
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        covariance[row][column] += centeredModel[row] * centeredEarth[column];
      }
    }
  }

  if (modelVariance < EPSILON) {
    throw new Error("模型控制点距离过近，无法稳定估计变换");
  }

  // 第 3 步：由协方差矩阵求最优旋转，使 R * 模型坐标 尽量贴近 Cesium 坐标。
  const rotation = calculateRotationFromCovariance(covariance);
  let scaleNumerator = 0;

  for (const pair of pairs) {
    const centeredModel = subtractVector(pair.model, modelCentroid);
    const centeredEarth = subtractVector(pair.earth, earthCentroid);
    const rotatedModel = multiplyMatrixVector(rotation, centeredModel);

    scaleNumerator += dotVector(centeredEarth, rotatedModel);
  }

  // 第 4 步：在旋转已知后，用最小二乘公式求统一缩放比例。
  const scale = scaleNumerator / modelVariance;

  if (!Number.isFinite(scale) || Math.abs(scale) < EPSILON) {
    throw new Error("无法估计有效缩放比例，请检查控制点");
  }

  // 第 5 步：让两个质心也满足 Q = s * R * P + T，从而解出平移 T。
  const translation = subtractVector(
    earthCentroid,
    scaleVector(multiplyMatrixVector(rotation, modelCentroid), scale),
  );
  const residuals = pairs.map<PointResidual>((pair) => {
    const predicted = transformPoint(pair.model, rotation, scale, translation);
    const delta = subtractVector(predicted, pair.earth);

    return {
      id: pair.id,
      label: pair.label,
      predicted,
      delta,
      distance: vectorLength(delta),
    };
  });
  const errorSum = residuals.reduce(
    (sum, residual) => sum + residual.distance,
    0,
  );
  const squaredErrorSum = residuals.reduce(
    (sum, residual) => sum + residual.distance * residual.distance,
    0,
  );

  return {
    scale,
    rotation,
    translation,
    matrixColumnMajor: createColumnMajorTransformArray(
      rotation,
      scale,
      translation,
    ),
    residuals,
    meanError: errorSum / residuals.length,
    rmsError: Math.sqrt(squaredErrorSum / residuals.length),
    maxError: Math.max(...residuals.map((residual) => residual.distance)),
  };
}
