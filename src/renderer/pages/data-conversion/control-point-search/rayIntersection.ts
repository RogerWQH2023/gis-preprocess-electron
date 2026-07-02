export type LocalVector3 = {
  x: number;
  y: number;
  z: number;
};

export type RayObservation = {
  id: string;
  origin: LocalVector3;
  direction: LocalVector3;
  createdAt: string;
};

export type RayIntersectionResult = {
  point: LocalVector3;
  meanError: number;
};

type Matrix3 = [
  [number, number, number],
  [number, number, number],
  [number, number, number],
];

const EPSILON = 1e-10;

function createZeroMatrix(): Matrix3 {
  return [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
}

function solveLinear3x3(matrix: Matrix3, vector: [number, number, number]) {
  const augmented = matrix.map((row, index) => [
    row[0],
    row[1],
    row[2],
    vector[index],
  ]);

  for (let pivotIndex = 0; pivotIndex < 3; pivotIndex += 1) {
    let maxRowIndex = pivotIndex;

    for (let rowIndex = pivotIndex + 1; rowIndex < 3; rowIndex += 1) {
      if (
        Math.abs(augmented[rowIndex][pivotIndex]) >
        Math.abs(augmented[maxRowIndex][pivotIndex])
      ) {
        maxRowIndex = rowIndex;
      }
    }

    if (Math.abs(augmented[maxRowIndex][pivotIndex]) < EPSILON) {
      return null;
    }

    if (maxRowIndex !== pivotIndex) {
      const currentRow = augmented[pivotIndex];
      augmented[pivotIndex] = augmented[maxRowIndex];
      augmented[maxRowIndex] = currentRow;
    }

    const pivot = augmented[pivotIndex][pivotIndex];

    for (let columnIndex = pivotIndex; columnIndex < 4; columnIndex += 1) {
      augmented[pivotIndex][columnIndex] /= pivot;
    }

    for (let rowIndex = 0; rowIndex < 3; rowIndex += 1) {
      if (rowIndex === pivotIndex) {
        continue;
      }

      const factor = augmented[rowIndex][pivotIndex];

      for (let columnIndex = pivotIndex; columnIndex < 4; columnIndex += 1) {
        augmented[rowIndex][columnIndex] -=
          factor * augmented[pivotIndex][columnIndex];
      }
    }
  }

  return {
    x: augmented[0][3],
    y: augmented[1][3],
    z: augmented[2][3],
  };
}

function distancePointToRay(point: LocalVector3, observation: RayObservation) {
  const vx = point.x - observation.origin.x;
  const vy = point.y - observation.origin.y;
  const vz = point.z - observation.origin.z;
  const { direction } = observation;

  const crossX = vy * direction.z - vz * direction.y;
  const crossY = vz * direction.x - vx * direction.z;
  const crossZ = vx * direction.y - vy * direction.x;

  return Math.hypot(crossX, crossY, crossZ);
}

export function intersectRaysLeastSquares(
  observations: RayObservation[],
): RayIntersectionResult | null {
  if (observations.length < 2) {
    return null;
  }

  const matrix = createZeroMatrix();
  const vector: [number, number, number] = [0, 0, 0];

  for (const observation of observations) {
    const { origin, direction } = observation;
    const dx = direction.x;
    const dy = direction.y;
    const dz = direction.z;

    // M = I - D * D^T，把点投影到垂直于射线方向的平面后累计最小二乘方程。
    const m00 = 1 - dx * dx;
    const m01 = -dx * dy;
    const m02 = -dx * dz;
    const m10 = -dy * dx;
    const m11 = 1 - dy * dy;
    const m12 = -dy * dz;
    const m20 = -dz * dx;
    const m21 = -dz * dy;
    const m22 = 1 - dz * dz;

    matrix[0][0] += m00;
    matrix[0][1] += m01;
    matrix[0][2] += m02;
    matrix[1][0] += m10;
    matrix[1][1] += m11;
    matrix[1][2] += m12;
    matrix[2][0] += m20;
    matrix[2][1] += m21;
    matrix[2][2] += m22;

    vector[0] += m00 * origin.x + m01 * origin.y + m02 * origin.z;
    vector[1] += m10 * origin.x + m11 * origin.y + m12 * origin.z;
    vector[2] += m20 * origin.x + m21 * origin.y + m22 * origin.z;
  }

  const point = solveLinear3x3(matrix, vector);

  if (!point) {
    return null;
  }

  const meanError =
    observations.reduce(
      (sum, observation) => sum + distancePointToRay(point, observation),
      0,
    ) / observations.length;

  return { point, meanError };
}
