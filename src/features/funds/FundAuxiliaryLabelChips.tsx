type AuxiliaryLabel = {
  id: number;
  name: string;
};

type FundAuxiliaryLabelChipsProps = {
  labels?: AuxiliaryLabel[];
};

export function FundAuxiliaryLabelChips({ labels = [] }: FundAuxiliaryLabelChipsProps) {
  if (labels.length === 0) {
    return null;
  }

  return (
    <span className="detail-history-labels" aria-label="補助ラベル">
      {labels.map((label) => (
        <span key={label.id} className="classification-result-label">
          {label.name}
        </span>
      ))}
    </span>
  );
}
