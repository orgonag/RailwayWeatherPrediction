import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parents[1]))
from build_network import read_varint, milepost_at

class NetworkTests(unittest.TestCase):
    def test_signed_varints_and_truncation(self):
        self.assertEqual(read_varint(bytes.fromhex('ac02'), 0), (150, 2))
        self.assertEqual(read_varint(bytes.fromhex('03'), 0), (-2, 1))
        with self.assertRaises(ValueError): read_varint(bytes.fromhex('80'), 0)
        with self.assertRaises(ValueError): read_varint(bytes.fromhex('8200'), 0)

    def test_mileposts_interpolate_only_inside_qualified_intervals(self):
        intervals = [[(0,10),(1000,11)], [(3000,15),(4000,14)]]
        self.assertEqual(milepost_at(500,intervals),10.5)
        self.assertEqual(milepost_at(3500,intervals),14.5)
        self.assertIsNone(milepost_at(2000,intervals))
        self.assertIsNone(milepost_at(5000,intervals))

if __name__ == '__main__': unittest.main()
