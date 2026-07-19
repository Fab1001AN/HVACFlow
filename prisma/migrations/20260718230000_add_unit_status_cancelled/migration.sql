-- Cancelling an order now cascades to its units: each becomes Cancelled so
-- it drops off active production dashboards and its own status reflects
-- reality (rather than continuing to show InProgress on dead work).
ALTER TYPE "UnitStatus" ADD VALUE 'Cancelled';
