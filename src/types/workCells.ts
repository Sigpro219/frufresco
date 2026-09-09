export interface WorkCellHistoryEntry {
    id: string;
    cell_id: string;
    cell_name: string;
    timestamp: string;
    field_changed: 'leader' | 'backup';
    previous_id: string | null;
    previous_name: string | null;
    new_id: string | null;
    new_name: string | null;
    changed_by?: string;
    reason?: string;
}

export interface CellResponsible {
    id: string;
    name: string;
    role?: string | null;
    email?: string | null;
}

export interface WorkCell {
    id: string;
    name: string;
    short_name: string;
    icon: string;
    icon_type?: 'sprout' | 'carrot' | 'layers' | 'apple' | 'boxes' | 'wheat' | 'milk' | 'beef' | 'package';
    inventory_group: string;
    categories: string[];
    buying_teams: string[];
    leader_id: string | null;
    leader_name: string | null;
    leader_role?: string | null;
    backup_id?: string | null;
    backup_name?: string | null;
    responsibles?: CellResponsible[];
    color: string;
    badge_bg: string;
    badge_text: string;
    description: string;
    updated_at?: string;
    history?: WorkCellHistoryEntry[];
}
