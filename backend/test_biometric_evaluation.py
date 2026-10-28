import unittest
import numpy as np

# Pure-math standalone unit tests for biometric evaluation metrics
class TestBiometricMetrics(unittest.TestCase):
    """
    Validates all biometric mathematical formulas, error rates, EER calculations,
    and edge cases using synthetic labeled test fixtures.
    """

    def test_far_calculation(self):
        # 10 impostor comparisons: 2 incorrectly accepted (<= threshold)
        impostor_distances = [0.15, 0.20, 0.35, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 1.00]
        threshold = 0.2385
        fp = sum(1 for d in impostor_distances if d <= threshold)
        total_imp = len(impostor_distances)
        far = fp / total_imp
        self.assertEqual(fp, 2)
        self.assertAlmostEqual(far, 0.20)

    def test_frr_and_gar_calculation(self):
        # 10 genuine comparisons: 1 incorrectly rejected (> threshold)
        genuine_distances = [0.05, 0.10, 0.12, 0.14, 0.18, 0.20, 0.22, 0.23, 0.235, 0.31]
        threshold = 0.2385
        fn = sum(1 for d in genuine_distances if d > threshold)
        total_gen = len(genuine_distances)
        frr = fn / total_gen
        gar = 1.0 - frr
        self.assertEqual(fn, 1)
        self.assertAlmostEqual(frr, 0.10)
        self.assertAlmostEqual(gar, 0.90)

    def test_eer_point_estimation(self):
        # Synthetic distributions with clear crossover around 0.30
        genuine = [0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40]
        impostor = [0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50]

        thresholds = [0.10, 0.20, 0.30, 0.40, 0.50]
        # At t=0.30:
        # Impostor <= 0.30: [0.20, 0.25, 0.30] -> 3/7 = 0.4286
        # Genuine > 0.30: [0.35, 0.40] -> 2/7 = 0.2857
        diffs = []
        for t in thresholds:
            fa = sum(1 for d in impostor if d <= t) / len(impostor)
            fr = sum(1 for d in genuine if d > t) / len(genuine)
            diffs.append(abs(fa - fr))

        min_idx = int(np.argmin(diffs))
        optimal_t = thresholds[min_idx]
        self.assertEqual(optimal_t, 0.30)

    def test_zero_samples_handling(self):
        # Handle empty genuine or impostor sets gracefully without ZeroDivisionError
        total_gen = 0
        total_imp = 0
        fn = 0
        fp = 0

        far = (fp / total_imp) if total_imp > 0 else 0.0
        frr = (fn / total_gen) if total_gen > 0 else 0.0
        gar = 1.0 - frr if total_gen > 0 else 0.0

        self.assertEqual(far, 0.0)
        self.assertEqual(frr, 0.0)
        self.assertEqual(gar, 0.0)

    def test_extreme_thresholds(self):
        # Extreme threshold 0.0: Rejects everything -> FAR=0, FRR=1.0, GAR=0.0
        # Extreme threshold 2.0: Accepts everything -> FAR=1.0, FRR=0.0, GAR=1.0
        genuine = [0.1, 0.2, 0.3]
        impostor = [0.5, 0.6, 0.7]

        # t = 0.0
        fp_0 = sum(1 for d in impostor if d <= 0.0)
        fn_0 = sum(1 for d in genuine if d > 0.0)
        self.assertEqual(fp_0 / len(impostor), 0.0)
        self.assertEqual(fn_0 / len(genuine), 1.0)

        # t = 2.0
        fp_2 = sum(1 for d in impostor if d <= 2.0)
        fn_2 = sum(1 for d in genuine if d > 2.0)
        self.assertEqual(fp_2 / len(impostor), 1.0)
        self.assertEqual(fn_2 / len(genuine), 0.0)

    def test_pairwise_accuracy_unbalanced(self):
        # 1 genuine, 9 impostors: demonstrate class imbalance consideration
        # If classifier always rejects:
        # TP = 0, TN = 9, FP = 0, FN = 1
        # Accuracy is 90%, but Recall is 0%!
        tp = 0
        tn = 9
        fp = 0
        fn = 1
        acc = (tp + tn) / (tp + tn + fp + fn)
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        self.assertEqual(acc, 0.90)
        self.assertEqual(recall, 0.0)

if __name__ == "__main__":
    unittest.main()
